package hr.dinowuk.radnenedjelje;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

/**
 * Prikazuje web aplikaciju ugrađenu u assets/www preko https://appassets.androidplatform.net
 * (pravi https izvor, pa radi fetch prema GitHubu i localStorage). Vanjske poveznice idu u druge aplikacije.
 */
public class MainActivity extends Activity {
    private static final String DOMENA = "appassets.androidplatform.net";
    private static final String POCETNA = "https://" + DOMENA + "/assets/www/index.html";

    private static final int ZAHTJEV_LOKACIJA = 1;
    private static final int ZAHTJEV_OBAVIJESTI = 2;

    private WebView webView;
    // Lokacija koju je stranica zatražila dok čekamo odgovor korisnika na Androidov upit
    private GeolocationPermissions.Callback cekaLokaciju;
    private String cekaLokacijuIzvor;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(DOMENA)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        FrameLayout okvir = new FrameLayout(this);
        okvir.setBackgroundColor(0xFF0F6B4F);
        webView = new WebView(this);
        okvir.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(okvir);

        // Od Androida 15 aplikacija crta i ispod statusne/navigacijske trake — odmakni sadržaj.
        okvir.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                v.setPadding(i.left, i.top, i.right, i.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        // Web dio po ovome zna koja je verzija instalirana (provjera ažuriranja).
        s.setUserAgentString(s.getUserAgentString() + " RadneNedjelje/" + BuildConfig.VERSION_CODE
                + " RadneNedjeljeVerzija/" + BuildConfig.VERSION_NAME);
        s.setGeolocationEnabled(true);

        // Most prema Androidu (postavke obavijesti); stranice su samo naše ugrađene datoteke.
        webView.addJavascriptInterface(new MostJS(this), "RadneNedjeljeApp");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String izvor, GeolocationPermissions.Callback cb) {
                if (!izvor.contains(DOMENA)) { cb.invoke(izvor, false, false); return; }
                if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    cb.invoke(izvor, true, false);
                } else {
                    cekaLokaciju = cb;
                    cekaLokacijuIzvor = izvor;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION}, ZAHTJEV_LOKACIJA);
                }
            }
        });

        ObavijestWorker.napraviKanal(this);
        ObavijestWorker.zakazi(this);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (DOMENA.equals(uri.getHost())) return false;
                otvoriVani(uri);
                return true;
            }
        });

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::natrag);
        }

        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(POCETNA);
    }

    private void otvoriVani(Uri uri) {
        try {
            String shema = uri.getScheme() == null ? "" : uri.getScheme();
            Intent intent = "mailto".equals(shema) ? new Intent(Intent.ACTION_SENDTO, uri) : new Intent(Intent.ACTION_VIEW, uri);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            // nema aplikacije koja to otvara — ništa
        }
    }

    boolean imaDopustenjeObavijesti() {
        return Build.VERSION.SDK_INT < 33
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    void traziDopustenjeObavijesti() {
        if (imaDopustenjeObavijesti()) javiStranici("obavijesti", true);
        else requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, ZAHTJEV_OBAVIJESTI);
    }

    private void javiStranici(String vrsta, boolean dano) {
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('dopustenje',{detail:{vrsta:'"
                + vrsta + "',dano:" + dano + "}}))", null);
    }

    @Override
    public void onRequestPermissionsResult(int kod, String[] dozvole, int[] rezultati) {
        super.onRequestPermissionsResult(kod, dozvole, rezultati);
        boolean dano = rezultati.length > 0 && rezultati[0] == PackageManager.PERMISSION_GRANTED;
        if (kod == ZAHTJEV_LOKACIJA && cekaLokaciju != null) {
            cekaLokaciju.invoke(cekaLokacijuIzvor, dano, false);
            cekaLokaciju = null;
        } else if (kod == ZAHTJEV_OBAVIJESTI) {
            javiStranici("obavijesti", dano);
        }
    }

    private void natrag() {
        if (webView.canGoBack()) webView.goBack();
        else finish();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        natrag();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
