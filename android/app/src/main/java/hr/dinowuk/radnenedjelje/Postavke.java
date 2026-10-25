package hr.dinowuk.radnenedjelje;

import android.content.Context;
import android.content.SharedPreferences;

/** Postavke koje web dio šalje Androidu (moji dućani, moja mjesta, obavijest) da ih vidi i pozadinski zadatak. */
final class Postavke {
    private static final String IME = "postavke";
    static final String KLJUC_JSON = "json";             // {"moji":[...],"mojaMjesta":[...],"obavijest":true}
    static final String KLJUC_ZADNJA = "zadnja_obavijest"; // datum nedjelje za koju je obavijest već poslana

    private Postavke() {}

    static SharedPreferences sp(Context c) {
        return c.getSharedPreferences(IME, Context.MODE_PRIVATE);
    }
}
