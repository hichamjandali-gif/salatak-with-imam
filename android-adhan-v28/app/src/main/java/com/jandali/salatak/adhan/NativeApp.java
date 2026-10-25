package com.jandali.salatak.adhan;

import android.Manifest;
import android.app.*;
import android.app.job.*;
import android.content.*;
import android.content.pm.*;
import android.content.res.AssetFileDescriptor;
import android.media.*;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.text.*;
import java.util.*;

public class NativeApp extends Activity {
    static final String STORE="salatak_v28_native",URL="file:///android_asset/index.html";
    static final String[] KEYS={"Fajr","Dhuhr","Asr","Maghrib","Isha"};
    static SharedPreferences p(Context c){return c.getSharedPreferences(STORE,0);}
    static boolean enabled(Context c){return p(c).getBoolean("enabled",false);}
    static void note(Context c,String s){p(c).edit().putString("status",s).apply();}
    static boolean permitted(Context c){
        if(Build.VERSION.SDK_INT<31)return true;
        AlarmManager a=(AlarmManager)c.getSystemService(ALARM_SERVICE);
        return a!=null&&a.canScheduleExactAlarms();
    }
    WebView web; Switch toggle;TextView status; boolean silent=false;
    GeolocationPermissions.Callback geoPending; String geoOrigin;
    void setToggle(boolean v){silent=true;toggle.setChecked(v);silent=false;}
    void showStatus(){status.setText(p(this).getString("status",enabled(this)?"الأذان مفعل":"الأذان متوقف"));}
    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        LinearLayout root=new LinearLayout(this);root.setOrientation(1);root.setBackgroundColor(0xffffffff);
        LinearLayout head=new LinearLayout(this);head.setOrientation(1);head.setPadding(16,6,16,6);head.setBackgroundColor(0xffebf5ef);
        toggle=new Switch(this);toggle.setText("الأذان التلقائي — تفعيل / إلغاء");toggle.setTextSize(17);
        head.addView(toggle);status=new TextView(this);status.setTextSize(12);head.addView(status);
        head.setVisibility(View.GONE);
        root.addView(head);web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
        web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);web.getSettings().setAllowFileAccess(true);web.getSettings().setAllowFileAccessFromFileURLs(false);web.getSettings().setAllowUniversalAccessFromFileURLs(false);
        web.setWebViewClient(new WebViewClient(){
            @Override public void onPageFinished(WebView view,String url){super.onPageFinished(view,url);
                view.evaluateJavascript("(function(){if(window.__adhanSettingsObserver)return;function update(){var t=document.body?document.body.innerText:'';var isSettings=!!(document.querySelector('h1,h2')&&/إعدادات المصحف والصلاة/.test(t.slice(0,450)));window.AdhanSettingsVisibility.settingsVisible(isSettings)};var o=new MutationObserver(function(){clearTimeout(window.__adhanSettingsTimer);window.__adhanSettingsTimer=setTimeout(update,120)});o.observe(document.documentElement,{subtree:true,childList:true,characterData:true});window.__adhanSettingsObserver=o;update()})()",null);
            }
        });
        web.setWebChromeClient(new WebChromeClient(){
 @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback){
 if(Build.VERSION.SDK_INT>=23 && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
 geoPending=callback;geoOrigin=origin;
 requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},45);
 } else callback.invoke(origin,true,false);
 }
 });
        web.loadUrl(URL);
        setToggle(enabled(this));showStatus();
        toggle.setOnCheckedChangeListener((v,checked)->{
            if(silent)return;
            if(!checked){disable(this);stopService(new Intent(this,AdhanService.class));showStatus();}
            else requestEnable();
        });
        // Show the native adhan toggle only on the web app's Settings screen.
        web.addJavascriptInterface(new Object(){
            @JavascriptInterface public void settingsVisible(boolean visible){
                runOnUiThread(()->head.setVisibility(visible?View.VISIBLE:View.GONE));
            }
        },"AdhanSettingsVisibility");

    }
    void requestEnable(){
        if(!permitted(this)){
            setToggle(false);
            new AlertDialog.Builder(this).setMessage("امنح تطبيق الصلاة صلاحية المنبهات والتذكيرات، ثم اضغط تفعيل مرة أخرى")
            .setPositiveButton("فتح إعدادات المنبه", (d,w)->startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName()))))
            .setNegativeButton("إلغاء",null).show();return;
        }
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
            setToggle(false);requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},44);return;
        }
        web.evaluateJavascript("(function(){try{return JSON.stringify({c:JSON.parse(localStorage.getItem('mushaf-coordinates')||'null'),s:JSON.parse(localStorage.getItem('mushaf-location-source')||'\"default\"'),m:JSON.parse(localStorage.getItem('mushaf-prayer-settings')||'null')});}catch(e){return ''}})()",v->{
            try{
                JSONObject j=new JSONObject(new JSONTokener(v).nextValue().toString());
                if("default".equals(j.optString("s","default"))||j.optJSONObject("c")==null)
                    throw new IllegalStateException("اختر مدينتك من إعدادات البرنامج، كي لا نستخدم توقيت مكة بالخطأ.");
                JSONObject c=j.getJSONObject("c");double lat=c.getDouble("latitude"),lon=c.getDouble("longitude");
                int method=j.optJSONObject("m")==null?4:Integer.parseInt(j.getJSONObject("m").optString("method","4"));
                if(Math.abs(lat)>90||Math.abs(lon)>180)throw new IllegalStateException("إحداثيات المدينة غير صحيحة");
                SharedPreferences pref=p(this);
                int generation=pref.getInt("generation",0)+1;
                pref.edit().putInt("generation",generation).putLong("lat",Double.doubleToRawLongBits(lat))
                    .putLong("lon",Double.doubleToRawLongBits(lon)).putInt("method",method).apply();
                status.setText("يتم جلب المواقيت وجدولة الأذان...");
                new Thread(()->{
                    try{
                        JSONArray data=fetch(lat,lon,method);
                        if(p(this).getInt("generation",0)!=generation)return;
                        if(data.length()<5)throw new IllegalStateException("مواقيت الصلاة غير مكتملة");
                        p(this).edit().putBoolean("enabled",true).apply();
                        schedule(this,data);
                        p(this).edit().putString("cache",data.toString()).apply();
                        registerJob(this);note(this,"الأذان مجدول؛ اختبره مع شاشة مقفلة");
                    }catch(Exception e){
                        if(p(this).getInt("generation",0)!=generation)return;
                        disable(this);note(this,"فشل تفعيل الأذان: "+e.getMessage());
                    }
                    runOnUiThread(()->{setToggle(enabled(this));showStatus();});
                },"adhan-init").start();
            }catch(Exception e){setToggle(false);
                new AlertDialog.Builder(this).setMessage(e.getMessage()).setPositiveButton("حسناً",null).show();}
        });
    }
    @Override protected void onResume(){super.onResume();if(toggle!=null){setToggle(enabled(this));showStatus();}}
    @Override public void onRequestPermissionsResult(int r,String[] perms,int[] grants){
        super.onRequestPermissionsResult(r,perms,grants);
        if(r==44 && grants.length>0 && grants[0]==PackageManager.PERMISSION_GRANTED)requestEnable();
 if(r==45 && geoPending!=null){
 boolean granted=false;for(int v:grants)if(v==PackageManager.PERMISSION_GRANTED)granted=true;
 geoPending.invoke(geoOrigin,granted,false);geoPending=null;geoOrigin=null;
 }
    }
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
    static PendingIntent pending(Context c,int id,String prayer,int flags){
        Intent i=new Intent(c,AdhanReceiver.class).setAction("salatak.ADHAN");
        i.putExtra("prayer",prayer);
        return PendingIntent.getBroadcast(c,id,i,flags|PendingIntent.FLAG_IMMUTABLE);
    }
    static void addAlarm(Context c,int id,long epoch,String prayer){
        AlarmManager a=(AlarmManager)c.getSystemService(ALARM_SERVICE);
        PendingIntent sound=pending(c,id,prayer,PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent display=PendingIntent.getActivity(c,1,new Intent(c,NativeApp.class),
            PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        a.setAlarmClock(new AlarmManager.AlarmClockInfo(epoch,display),sound);
    }
    static synchronized void cancel(Context c){
        AlarmManager a=(AlarmManager)c.getSystemService(ALARM_SERVICE);
        try{
            JSONArray cache=new JSONArray(p(c).getString("cache","[]"));
            for(int i=0;i<cache.length();i++){
                JSONObject e=cache.getJSONObject(i);
                PendingIntent pi=pending(c,e.getInt("id"),e.getString("prayer"),PendingIntent.FLAG_NO_CREATE);
                if(pi!=null){a.cancel(pi);pi.cancel();}
            }
        }catch(Exception ignored){}
        PendingIntent test=pending(c,28128,"Test",PendingIntent.FLAG_NO_CREATE);
        if(test!=null){a.cancel(test);test.cancel();}
    }
    static void disable(Context c){
        SharedPreferences x=p(c);
        x.edit().putBoolean("enabled",false).putInt("generation",x.getInt("generation",0)+1).apply();
        cancel(c);
        JobScheduler jobs=(JobScheduler)c.getSystemService(JOB_SCHEDULER_SERVICE);
        if(jobs!=null)jobs.cancel(28001);
        note(c,"الأذان متوقف");
    }
    static synchronized void schedule(Context c,JSONArray data)throws Exception{
        if(!enabled(c)||!permitted(c))return;
        cancel(c);
        long now=System.currentTimeMillis();
        for(int i=0;i<data.length();i++){
            JSONObject e=data.getJSONObject(i);long epoch=e.getLong("epoch");
            if(epoch>now+1000)addAlarm(c,e.getInt("id"),epoch,e.getString("prayer"));
        }
    }
    static JSONArray fetch(double lat,double lon,int method)throws Exception{
        JSONArray all=new JSONArray();
        Calendar month=Calendar.getInstance();
        for(int m=0;m<2;m++){
            int year=month.get(Calendar.YEAR),mon=month.get(Calendar.MONTH)+1;
            String url=String.format(Locale.US,
                "https://api.aladhan.com/v1/calendar/%d/%d?latitude=%.6f&longitude=%.6f&method=%d",
                year,mon,lat,lon,method);
            HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
            c.setConnectTimeout(10000);c.setReadTimeout(10000);
            try{
                if(c.getResponseCode()!=200)throw new IllegalStateException("تعذر جلب جدول الأوقات");
                StringBuilder buf=new StringBuilder();
                try(BufferedReader reader=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){
                    String line;while((line=reader.readLine())!=null)buf.append(line);
                }
                JSONArray days=new JSONObject(buf.toString()).getJSONArray("data");
                for(int i=0;i<days.length();i++){
                    JSONObject day=days.getJSONObject(i);
                    String ds=day.getJSONObject("date").getJSONObject("gregorian").getString("date");
                    String tz=day.getJSONObject("meta").getString("timezone");
                    TimeZone zone=TimeZone.getTimeZone(tz);
                    if("GMT".equals(zone.getID())&&!"GMT".equals(tz))throw new IllegalStateException("منطقة زمنية غير صحيحة");
                    SimpleDateFormat parser=new SimpleDateFormat("dd-MM-yyyy HH:mm",Locale.US);
                    parser.setLenient(false);parser.setTimeZone(zone);
                    JSONObject timings=day.getJSONObject("timings");
                    int dayNum=Integer.parseInt(ds.substring(6,10)+ds.substring(3,5)+ds.substring(0,2));
                    for(int p=0;p<KEYS.length;p++){
                        String clock=timings.getString(KEYS[p]).substring(0,5);
                        Date d=parser.parse(ds+" "+clock);
                        if(d==null||d.getTime()<System.currentTimeMillis()+2000
                           ||d.getTime()>System.currentTimeMillis()+22L*24*3600*1000)continue;
                        JSONObject entry=new JSONObject();
                        entry.put("id",dayNum*10+p).put("epoch",d.getTime()).put("prayer",KEYS[p]);
                        all.put(entry);
                    }
                }
            }finally{c.disconnect();}
            month.add(Calendar.MONTH,1);
        }
        return all;
    }
    static void refresh(Context c)throws Exception{
        if(!enabled(c))return;
        SharedPreferences x=p(c);
        double lat=Double.longBitsToDouble(x.getLong("lat",0)),lon=Double.longBitsToDouble(x.getLong("lon",0));
        JSONArray entries=fetch(lat,lon,x.getInt("method",4));
        if(!enabled(c))return;
        schedule(c,entries);
        x.edit().putString("cache",entries.toString()).apply();
    }
    static void registerJob(Context c){
        JobScheduler j=(JobScheduler)c.getSystemService(JOB_SCHEDULER_SERVICE);
        j.schedule(new JobInfo.Builder(28001,new ComponentName(c,RefreshJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(12*60*60*1000L).setPersisted(true).build());
    }
    public static class BootReceiver extends BroadcastReceiver{
        @Override public void onReceive(Context c,Intent i){
            if(!enabled(c)||!permitted(c))return;
            try{schedule(c,new JSONArray(p(c).getString("cache","[]")));registerJob(c);}
            catch(Exception ignored){}
        }
    }
    public static class RefreshJob extends JobService{
        @Override public boolean onStartJob(JobParameters params){
            new Thread(()->{try{refresh(this);}catch(Exception e){note(this,"تعذر تحديث الأوقات: "+e.getMessage());}
                jobFinished(params,false);}).start();
            return true;
        }
        @Override public boolean onStopJob(JobParameters params){return true;}
    }
    public static class AdhanReceiver extends BroadcastReceiver{
        @Override public void onReceive(Context c,Intent i){
            if(!enabled(c))return;
            String name=i.getStringExtra("prayer");
            boolean okay="Test".equals(name);
            for(String p:KEYS)if(p.equals(name))okay=true;
            if(!okay)return;
            Intent play=new Intent(c,AdhanService.class).putExtra("prayer",name);
            try{c.startForegroundService(play);}catch(Exception e){note(c,"منع النظام بدء الأذان: "+e.getMessage());}
        }
    }
    public static class AdhanService extends Service{
        MediaPlayer audio;PowerManager.WakeLock wake;
        @Override public void onCreate(){
            super.onCreate();
            NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
            manager.createNotificationChannel(new NotificationChannel("adhan_v28","أذان الصلاة",NotificationManager.IMPORTANCE_LOW));
        }
        @Override public int onStartCommand(Intent intent,int flags,int startId){
            if(!enabled(this)){stopSelf();return START_NOT_STICKY;}
            String name=intent==null?"":intent.getStringExtra("prayer");
            if(name==null){stopSelf();return START_NOT_STICKY;}
            PendingIntent open=PendingIntent.getActivity(this,1,new Intent(this,NativeApp.class),
                PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
            Notification n=new Notification.Builder(this,"adhan_v28").setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("أذان "+name).setContentText("صلاتك مع الإمام – الأذان جارٍ")
                .setContentIntent(open).setOngoing(true).build();
            try{
                if(Build.VERSION.SDK_INT>=29)
                    startForeground(28028,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                else startForeground(28028,n);
                stopAudio();
                PowerManager pm=(PowerManager)getSystemService(POWER_SERVICE);
                wake=pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Salatak:adhan");
                wake.acquire(360000);
                audio=new MediaPlayer();
                audio.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
                int track="Fajr".equals(name)?R.raw.adhan_fajr:R.raw.adhan;
                try(AssetFileDescriptor fd=getResources().openRawResourceFd(track)){
                    audio.setDataSource(fd.getFileDescriptor(),fd.getStartOffset(),fd.getLength());
                }
                audio.setOnCompletionListener(mp->{stopAudio();stopSelf();});
                audio.setOnErrorListener((mp,x,y)->{stopAudio();stopSelf();return true;});
                audio.prepare();audio.start();
            }catch(Exception e){note(this,"خطأ تشغيل الأذان: "+e.getMessage());stopAudio();stopSelf();}
            return START_NOT_STICKY;
        }
        void stopAudio(){if(audio!=null){try{audio.stop();}catch(Exception ignored){}audio.release();audio=null;}
            if(wake!=null){if(wake.isHeld())wake.release();wake=null;}}
        @Override public void onDestroy(){stopAudio();super.onDestroy();}
        @Override public IBinder onBind(Intent i){return null;}
    }
}
