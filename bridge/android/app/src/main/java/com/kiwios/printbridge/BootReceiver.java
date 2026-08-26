package com.kiwios.printbridge;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;

public final class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (!BridgeStore.token(context).isEmpty()) ContextCompat.startForegroundService(context, new Intent(context, BridgeService.class));
    }
}
