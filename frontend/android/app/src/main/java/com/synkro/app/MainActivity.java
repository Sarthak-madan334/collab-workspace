package com.synkro.app;

import android.os.Bundle;
import android.view.View;
import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);

        // The activity stays full-height while the IME opens. Apply its inset once
        // to the WebView's parent, then keep the WebView from applying it again.
        View root = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            int systemTypes = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets bars = insets.getInsets(systemTypes);
            boolean keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
            int bottom = keyboardVisible ? Math.max(bars.bottom, keyboard.bottom) : bars.bottom;
            view.setPadding(bars.left, bars.top, bars.right, bottom);

            return new WindowInsetsCompat.Builder(insets)
                .setInsets(systemTypes, Insets.NONE)
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .setVisible(WindowInsetsCompat.Type.ime(), false)
                .build();
        });
        ViewCompat.requestApplyInsets(root);
    }
}
