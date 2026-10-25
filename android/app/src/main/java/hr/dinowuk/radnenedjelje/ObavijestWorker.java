package hr.dinowuk.radnenedjelje;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Subotom navečer (17–22 h) jednom javi koji od mojih dućana / dućana u mojim mjestima sutra rade.
 * Pokreće se svaka 2 sata (WorkManager), a obavijest šalje samo kad je vrijeme i samo jednom po nedjelji.
 */
public class ObavijestWorker extends Worker {
    private static final String PODACI_URL =
            "https://raw.githubusercontent.com/dinowuk/radne-nedjelje-medjimurje/main/docs/podaci/nedjelje.json";
    private static final String KANAL = "subota";
    private static final String POSAO = "obavijest-subotom";
    private static final String ODMAH = "odmah";
    private static final ZoneId ZAGREB = ZoneId.of("Europe/Zagreb");

    public ObavijestWorker(@NonNull Context c, @NonNull WorkerParameters p) {
        super(c, p);
    }

    static void zakazi(Context c) {
        PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(ObavijestWorker.class, 2, TimeUnit.HOURS).build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(POSAO, ExistingPeriodicWorkPolicy.KEEP, r);
    }

    static void pokreniOdmah(Context c) {
        OneTimeWorkRequest r = new OneTimeWorkRequest.Builder(ObavijestWorker.class)
                .setInputData(new Data.Builder().putBoolean(ODMAH, true).build()).build();
        WorkManager.getInstance(c).enqueue(r);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        boolean odmah = getInputData().getBoolean(ODMAH, false);
        SharedPreferences sp = Postavke.sp(c);
        try {
            JSONObject post = new JSONObject(sp.getString(Postavke.KLJUC_JSON, "{}"));
            if (!odmah && !post.optBoolean("obavijest", false)) return Result.success();

            ZonedDateTime sada = ZonedDateTime.now(ZAGREB);
            LocalDate nedjelja = sada.toLocalDate().with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
            String datum = nedjelja.toString();
            if (!odmah) {
                boolean jeVrijeme = sada.getDayOfWeek() == DayOfWeek.SATURDAY && sada.getHour() >= 17 && sada.getHour() < 22;
                if (!jeVrijeme || datum.equals(sp.getString(Postavke.KLJUC_ZADNJA, ""))) return Result.success();
            }

            JSONObject podaci = new JSONObject(preuzmi(PODACI_URL));
            Set<String> moji = skup(post.optJSONArray("moji"));
            Set<String> mjesta = skup(post.optJSONArray("mojaMjesta"));

            List<String> rade = new ArrayList<>();
            List<String> neRade = new ArrayList<>();
            int nepoznato = 0;
            JSONArray tr = podaci.getJSONArray("trgovine");
            for (int i = 0; i < tr.length(); i++) {
                JSONObject t = tr.getJSONObject(i);
                boolean moj = !moji.isEmpty() ? moji.contains(t.getString("id"))
                        : mjesta.isEmpty() || mjesta.contains(t.getString("mjesto"));
                if (!moj) continue;
                JSONObject ned = t.optJSONObject("nedjelje");
                String opis = t.getString("lanac") + " " + t.getString("mjesto");
                if (ned == null || !ned.has(datum)) { nepoznato++; continue; }
                if (ned.isNull(datum)) { neRade.add(opis); continue; }
                String v = ned.getString(datum);
                rade.add("otvoreno".equals(v) ? opis : opis + " " + v.replace("-", "–"));
            }

            String naslov;
            StringBuilder tekst = new StringBuilder();
            if (!moji.isEmpty()) {
                naslov = rade.isEmpty() ? "Sutra ne radi nijedan tvoj dućan" : "Sutra rade tvoji dućani";
                if (!rade.isEmpty()) tekst.append(String.join("\n", rade));
                if (!neRade.isEmpty()) tekst.append(tekst.length() > 0 ? "\n" : "").append("Ne rade: ").append(String.join(", ", neRade));
            } else {
                String gdje = mjesta.isEmpty() ? "u Međimurju" : "u tvojim mjestima";
                naslov = "Sutra " + gdje + " radi " + rade.size() + " " + (rade.size() == 1 ? "dućan" : "dućana");
                tekst.append(String.join("\n", rade.subList(0, Math.min(8, rade.size()))));
                if (rade.size() > 8) tekst.append("\n… i još ").append(rade.size() - 8);
            }
            if (nepoznato > 0 && rade.isEmpty() && neRade.isEmpty()) {
                naslov = "Radno vrijeme za sutra još nije objavljeno";
                tekst.setLength(0);
                tekst.append("Provjeri u aplikaciji kasnije.");
            }

            posalji(c, naslov, tekst.toString());
            if (!odmah) sp.edit().putString(Postavke.KLJUC_ZADNJA, datum).apply();
            return Result.success();
        } catch (Exception e) {
            return odmah ? Result.failure() : Result.retry();
        }
    }

    private static Set<String> skup(JSONArray a) {
        Set<String> s = new HashSet<>();
        if (a != null) for (int i = 0; i < a.length(); i++) s.add(a.optString(i));
        return s;
    }

    private static String preuzmi(String adresa) throws Exception {
        HttpURLConnection k = (HttpURLConnection) new URL(adresa + "?t=" + System.currentTimeMillis()).openConnection();
        k.setConnectTimeout(20000);
        k.setReadTimeout(30000);
        try (InputStream in = k.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] b = new byte[16384];
            int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
            return out.toString("UTF-8");
        } finally {
            k.disconnect();
        }
    }

    static void napraviKanal(Context c) {
        NotificationChannel ch = new NotificationChannel(KANAL, "Radne nedjelje subotom", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("Subotom navečer: koji tvoji dućani sutra rade");
        c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    private static void posalji(Context c, String naslov, String tekst) {
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        napraviKanal(c);
        Intent i = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, KANAL)
                .setSmallIcon(R.drawable.ic_obavijest)
                .setColor(0xFF0F6B4F)
                .setContentTitle(naslov)
                .setContentText(tekst.isEmpty() ? null : tekst.split("\n")[0])
                .setStyle(new NotificationCompat.BigTextStyle().bigText(tekst))
                .setContentIntent(pi)
                .setAutoCancel(true);
        NotificationManagerCompat.from(c).notify(1, b.build());
    }
}
