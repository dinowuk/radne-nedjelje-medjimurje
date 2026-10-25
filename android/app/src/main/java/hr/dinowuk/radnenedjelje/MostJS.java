package hr.dinowuk.radnenedjelje;

import android.webkit.JavascriptInterface;

/** Sučelje koje web dio vidi kao window.RadneNedjeljeApp (samo ugrađene stranice aplikacije). */
final class MostJS {
    private final MainActivity aktivnost;

    MostJS(MainActivity aktivnost) {
        this.aktivnost = aktivnost;
    }

    /** Spremi moje dućane/mjesta i uključenost obavijesti (JSON iz web dijela). */
    @JavascriptInterface
    public void spremiPostavke(String json) {
        Postavke.sp(aktivnost).edit().putString(Postavke.KLJUC_JSON, json).apply();
    }

    @JavascriptInterface
    public String procitajPostavke() {
        return Postavke.sp(aktivnost).getString(Postavke.KLJUC_JSON, "");
    }

    /** Zatraži dopuštenje za obavijesti (Android 13+); rezultat stiže u web dio kao događaj. */
    @JavascriptInterface
    public void traziObavijesti() {
        aktivnost.runOnUiThread(aktivnost::traziDopustenjeObavijesti);
    }

    @JavascriptInterface
    public boolean obavijestiDopustene() {
        return aktivnost.imaDopustenjeObavijesti();
    }

    /** Za probu: pošalji obavijest odmah (za nadolazeću nedjelju). */
    @JavascriptInterface
    public void probnaObavijest() {
        ObavijestWorker.pokreniOdmah(aktivnost);
    }
}
