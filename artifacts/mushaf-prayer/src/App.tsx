import { createContext, type Dispatch, type ReactNode, type SetStateAction, useContext, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BookOpen,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Compass,
  Download,
  Home as HomeIcon,
  Info,
  LocateFixed,
  MapPin,
  Menu,
  Minus,
  Moon,
  Navigation,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
  TimerReset,
  Volume2,
  WifiOff,
} from 'lucide-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';

type Theme = 'light' | 'dark';
type Coordinates = { latitude: number; longitude: number };
type SettingsState = {
  theme: Theme;
  fontSize: number;
  method: string;
  notifications: boolean;
};
type Surah = { number: number; name: string; englishName: string; englishNameTranslation: string; numberOfAyahs: number; revelationType: string };
type Ayah = { number: number; numberInSurah: number; text: string };

const PRAYERS = [
  { key: 'Fajr', label: 'الفجر', note: 'صلاة الفجر' },
  { key: 'Sunrise', label: 'الشروق', note: 'وقت الشروق' },
  { key: 'Dhuhr', label: 'الظهر', note: 'صلاة الظهر' },
  { key: 'Asr', label: 'العصر', note: 'صلاة العصر' },
  { key: 'Maghrib', label: 'المغرب', note: 'صلاة المغرب' },
  { key: 'Isha', label: 'العشاء', note: 'صلاة العشاء' },
] as const;
const METHODS = [
  { value: '4', label: 'أم القرى (مكة المكرمة)' },
  { value: '3', label: 'رابطة العالم الإسلامي' },
  { value: '2', label: 'الجمعية الإسلامية لأمريكا الشمالية' },
  { value: '5', label: 'الهيئة المصرية العامة للمساحة' },
];
const DEFAULT_COORDS: Coordinates = { latitude: 21.4225, longitude: 39.8262 };
const PRAYER_STORAGE = 'mushaf-prayer-settings';
// Audio is intentionally isolated here so a future recitation endpoint can be
// connected without changing the Quran reader's data model.
const RECITATION = {
  enabled: false,
  defaultReciter: 'ar.alafasy',
  audioUrl: (surah: number, ayah: number) => `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${surah}:${ayah}.mp3`,
};

const adhkarSets = {
  morning: {
    title: 'أذكار الصباح',
    subtitle: 'بداية هادئة بنور الذكر',
    items: [
      { text: 'أصبحنا وأصبح الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير.', count: 1 },
      { text: 'اللهم بك أصبحنا وبك أمسينا، وبك نحيا وبك نموت وإليك النشور.', count: 1 },
      { text: 'رضيت بالله رباً، وبالإسلام ديناً، وبمحمد صلى الله عليه وسلم نبياً.', count: 3 },
      { text: 'سبحان الله وبحمده.', count: 100 },
    ],
  },
  evening: {
    title: 'أذكار المساء',
    subtitle: 'اختم يومك بقلب مطمئن',
    items: [
      { text: 'أمسينا وأمسى الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له.', count: 1 },
      { text: 'اللهم إني أسألك خير هذه الليلة، وأعوذ بك من شرها وشر ما فيها.', count: 1 },
      { text: 'حسبي الله لا إله إلا هو عليه توكلت وهو رب العرش العظيم.', count: 7 },
      { text: 'أستغفر الله وأتوب إليه.', count: 100 },
    ],
  },
  prayer: {
    title: 'بعد الصلاة',
    subtitle: 'دقائق تحفظ أثر الصلاة',
    items: [
      { text: 'أستغفر الله، أستغفر الله، أستغفر الله.', count: 3 },
      { text: 'اللهم أنت السلام ومنك السلام، تباركت يا ذا الجلال والإكرام.', count: 1 },
      { text: 'سبحان الله، والحمد لله، والله أكبر.', count: 33 },
      { text: 'لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير.', count: 1 },
    ],
  },
} as const;

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}
function writeStorage<T>(key: string, value: T) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage is optional */ }
}
function formatTime(value?: string) { return value ? value.slice(0, 5) : '—:—'; }
function formatArabicDate(date = new Date()) {
  return new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}
function formatGregorianDate(date = new Date()) {
  return new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}
function prayerApiUrl(coords: Coordinates, method: string) {
  const date = new Intl.DateTimeFormat('en-GB').format(new Date()).replaceAll('/', '-');
  return `https://api.aladhan.com/v1/timings/${date}?latitude=${coords.latitude}&longitude=${coords.longitude}&method=${method}`;
}
function qiblaBearing(coords: Coordinates) {
  const kaabaLat = 21.422487 * Math.PI / 180;
  const kaabaLng = 39.826206 * Math.PI / 180;
  const lat = coords.latitude * Math.PI / 180;
  const lng = coords.longitude * Math.PI / 180;
  const y = Math.sin(kaabaLng - lng);
  const x = Math.cos(lat) * Math.tan(kaabaLat) - Math.sin(lat) * Math.cos(kaabaLng - lng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function useLocalState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStorage(key, fallback));
  useEffect(() => writeStorage(key, value), [key, value]);
  return [value, setValue] as const;
}

type AppContextValue = {
  settings: SettingsState;
  setSettings: Dispatch<SetStateAction<SettingsState>>;
  coords: Coordinates;
  locationName: string;
  refreshLocation: () => void;
  locationState: 'idle' | 'loading' | 'ready' | 'error';
  favorites: number[];
  setFavorites: Dispatch<SetStateAction<number[]>>;
  bookmarks: string[];
  setBookmarks: Dispatch<SetStateAction<string[]>>;
  lastRead: { surah: number; ayah: number } | null;
  setLastRead: Dispatch<SetStateAction<{ surah: number; ayah: number } | null>>;
};
const AppContext = createContext<AppContextValue | null>(null);
function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('App context is missing');
  return context;
}

function AppShell({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useLocalState<SettingsState>(PRAYER_STORAGE, { theme: 'light', fontSize: 30, method: '4', notifications: false });
  const [coords, setCoords] = useLocalState<Coordinates>('mushaf-coordinates', DEFAULT_COORDS);
  const [locationName, setLocationName] = useLocalState('mushaf-location-name', 'مكة المكرمة');
  const [locationState, setLocationState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [favorites, setFavorites] = useLocalState<number[]>('mushaf-favorites', []);
  const [bookmarks, setBookmarks] = useLocalState<string[]>('mushaf-bookmarks', []);
  const [lastRead, setLastRead] = useLocalState<{ surah: number; ayah: number } | null>('mushaf-last-read', null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'ar';
  }, [settings.theme]);
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  }, []);
  const refreshLocation = () => {
    if (!navigator.geolocation) { setLocationState('error'); return; }
    setLocationState('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setCoords(next); setLocationName('موقعك الحالي'); setLocationState('ready');
      },
      () => setLocationState('error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  };
  const value = { settings, setSettings, coords, locationName, refreshLocation, locationState, favorites, setFavorites, bookmarks, setBookmarks, lastRead, setLastRead };
  return <AppContext.Provider value={value}><div className="min-h-[100dvh] bg-background">{children}</div></AppContext.Provider>;
}

const navItems = [
  { href: '/', label: 'الرئيسية', icon: HomeIcon },
  { href: '/quran', label: 'القرآن', icon: BookOpen },
  { href: '/qibla', label: 'القبلة', icon: Compass },
  { href: '/adhkar', label: 'الأذكار', icon: Sparkles },
  { href: '/settings', label: 'الإعدادات', icon: Settings },
];
function BottomNav() {
  const [location] = useLocation();
  return <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/80 bg-background/95 backdrop-blur-xl safe-bottom">
    <div className="mx-auto flex max-w-[680px] justify-around px-2 pt-2">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? location === '/' : location.startsWith(href);
        return <Link key={href} href={href} data-testid={`link-nav-${label}`} aria-label={label} className={`relative flex min-h-[54px] min-w-[54px] flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`}>
          {active && <span className="absolute top-0 h-1 w-7 rounded-full bg-accent" />}
          <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
          <span className="font-medium">{label}</span>
        </Link>;
      })}
    </div>
  </nav>;
}
function TopBar({ title, back = false }: { title: string; back?: boolean }) {
  const [, setLocation] = useLocation();
  return <header className="mx-auto flex w-full max-w-[680px] items-center justify-between px-5 pb-3 pt-5">
    <div className="flex items-center gap-3">
      {back ? <button data-testid="button-back" onClick={() => setLocation('/quran')} className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-secondary-foreground" aria-label="رجوع"><ChevronRight size={20} /></button> : <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground"><span className="font-arabic text-xl">م</span></div>}
      <div><p className="text-[11px] font-bold tracking-[.18em] text-accent">المصحف والصلاة</p><h1 className="text-lg font-extrabold">{title}</h1></div>
    </div>
    {!back && <Link href="/settings" data-testid="link-settings-top" aria-label="الإعدادات" className="grid h-10 w-10 place-items-center rounded-full border border-border text-muted-foreground"><Menu size={19} /></Link>}
    {back && <Link href="/quran" data-testid="link-quran-top" aria-label="قائمة السور" className="grid h-10 w-10 place-items-center rounded-full border border-border text-muted-foreground"><BookOpen size={18} /></Link>}
  </header>;
}
function PageFrame({ children, title, back = false }: { children: ReactNode; title: string; back?: boolean }) {
  return <div className="mx-auto min-h-[100dvh] max-w-[680px] pb-28"><TopBar title={title} back={back} />{children}<BottomNav /></div>;
}
function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <div className="mb-4 flex items-end justify-between gap-3"><div>{eyebrow && <p className="mb-1 text-[11px] font-bold tracking-[.16em] text-accent">{eyebrow}</p>}<h2 className="text-xl font-extrabold">{title}</h2></div>{action}</div>;
}
function Skeleton({ className = '' }: { className?: string }) { return <div className={`animate-pulse rounded-xl bg-muted ${className}`} />; }
function FriendlyError({ onRetry, message = 'تعذّر جلب البيانات الآن' }: { onRetry?: () => void; message?: string }) {
  return <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-center"><CircleAlert className="mx-auto mb-2 text-destructive" size={24} /><p className="text-sm font-bold">{message}</p><p className="mt-1 text-xs text-muted-foreground">يمكنك المحاولة مرة أخرى أو متابعة القراءة المحفوظة.</p>{onRetry && <button onClick={onRetry} data-testid="button-retry" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-secondary px-4 text-sm font-bold"><RefreshCw size={16} /> إعادة المحاولة</button>}</div>;
}

function PrayerCard({ prayer, time, next }: { prayer: typeof PRAYERS[number]; time: string; next: boolean }) {
  return <div className={`relative flex min-w-[92px] flex-1 flex-col gap-2 overflow-hidden rounded-2xl border p-3 transition-transform ${next ? 'border-accent/70 bg-primary text-primary-foreground shadow-lg shadow-primary/10' : 'border-border bg-card'}`}>
    {next && <span className="absolute left-2 top-2 h-1.5 w-1.5 rounded-full bg-accent animate-breathe" />}
    <span className={`text-xs ${next ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{prayer.label}</span><strong className="text-lg tracking-tight">{time}</strong><span className={`text-[10px] ${next ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>{next ? 'الصلاة القادمة' : prayer.note}</span>
  </div>;
}
function usePrayerTimes() {
  const { coords, settings } = useApp();
  const [times, setTimes] = useState<Record<string, string> | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = () => {
    setStatus('loading');
    fetch(prayerApiUrl(coords, settings.method)).then((response) => { if (!response.ok) throw new Error(); return response.json(); }).then((json) => { setTimes(json.data.timings); setStatus('ready'); }).catch(() => setStatus('error'));
  };
  useEffect(load, [coords.latitude, coords.longitude, settings.method]);
  return { times, status, retry: load };
}
function useCountdown(times: Record<string, string> | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const interval = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(interval); }, []);
  const upcoming = useMemo(() => {
    const all = PRAYERS.filter((prayer) => prayer.key !== 'Sunrise').map((prayer) => {
      const [hour, minute] = (times?.[prayer.key] ?? '00:00').split(':').map(Number);
      const date = new Date(); date.setHours(hour, minute, 0, 0);
      return { prayer, date };
    });
    return all.find((item) => item.date.getTime() > now) ?? { prayer: PRAYERS[0], date: new Date(all[0].date.getTime() + 86400000) };
  }, [times, now]);
  const diff = Math.max(0, upcoming.date.getTime() - now);
  return { upcoming, countdown: `${String(Math.floor(diff / 3600000)).padStart(2, '0')}:${String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0')}` };
}

function HomePage() {
  const { locationName, locationState, refreshLocation, lastRead } = useApp();
  const { times, status, retry } = usePrayerTimes();
  const { upcoming, countdown } = useCountdown(times);
  const [today] = useState(new Date());
  return <PageFrame title="مساحتك للعبادة">
    <main className="space-y-6 px-5">
      <section className="pattern-star relative overflow-hidden rounded-[1.8rem] bg-primary p-6 text-primary-foreground shadow-xl shadow-primary/10 animate-rise">
        <div className="absolute -left-8 -top-10 h-36 w-36 rounded-full border border-accent/30" /><div className="absolute -left-1 top-0 h-24 w-24 rounded-full border border-accent/20" />
        <div className="relative">
          <div className="flex items-center justify-between"><div><p className="text-sm text-primary-foreground/65">{formatGregorianDate(today)}</p><p className="mt-1 text-xs text-accent">{formatArabicDate(today)}</p></div><span className="rounded-full border border-primary-foreground/20 px-3 py-1 text-[11px]">يوم مبارك</span></div>
          <div className="mt-8 flex items-end justify-between"><div><p className="text-xs text-primary-foreground/65">الصلاة القادمة</p><h2 className="mt-1 text-3xl font-extrabold">{upcoming.prayer.label}</h2><p className="mt-1 text-sm text-primary-foreground/70">{formatTime(times?.[upcoming.prayer.key])}</p></div><div className="text-left"><p className="text-[10px] text-primary-foreground/60">متبقي</p><p className="font-mono text-2xl font-bold tracking-wider">{countdown}</p></div></div>
        </div>
      </section>
      <section className="animate-rise-delay-1">
        <div className="mb-3 flex items-center justify-between"><SectionHeading eyebrow="مواقيت اليوم" title="الصلوات" /><button onClick={retry} data-testid="button-refresh-prayers" aria-label="تحديث مواقيت الصلاة" className="mb-1 rounded-full p-2 text-muted-foreground hover:bg-secondary"><RefreshCw size={17} className={status === 'loading' ? 'animate-spin' : ''} /></button></div>
        {status === 'error' ? <FriendlyError onRetry={retry} message="تعذّر تحميل مواقيت الصلاة" /> : status === 'loading' ? <div className="flex gap-2 overflow-hidden">{[1, 2, 3, 4, 5].map((x) => <Skeleton key={x} className="h-[100px] min-w-[92px] flex-1" />)}</div> : <div className="flex gap-2 overflow-x-auto pb-1">{PRAYERS.map((prayer) => <PrayerCard key={prayer.key} prayer={prayer} time={formatTime(times?.[prayer.key])} next={prayer.key === upcoming.prayer.key} />)}</div>}
      </section>
      <section className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 animate-rise-delay-1">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-accent/15 text-accent"><MapPin size={17} /></span><div><p className="text-xs text-muted-foreground">الموقع</p><p className="text-sm font-bold">{locationName}</p></div></div>
        <button onClick={refreshLocation} disabled={locationState === 'loading'} data-testid="button-refresh-location-home" className="flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-bold text-primary disabled:opacity-50">{locationState === 'loading' ? <RefreshCw size={14} className="animate-spin" /> : <LocateFixed size={14} />} تحديث</button>
      </section>
      {locationState === 'error' && <p className="text-xs text-destructive">لم نتمكن من الوصول للموقع. تأكد من إذن الموقع أو اختر موقعك الافتراضي من الإعدادات.</p>}
      <section className="animate-rise-delay-2"><SectionHeading eyebrow="اقترب أكثر" title="مساراتك اليومية" />
        <div className="grid grid-cols-2 gap-3">
          <Link href="/quran" data-testid="link-home-quran" className="group col-span-2 flex items-center justify-between overflow-hidden rounded-2xl bg-secondary p-5 transition-transform active:scale-[.98]"><div><p className="text-xs text-muted-foreground">وردك اليومي</p><h3 className="mt-1 text-lg font-extrabold">أكمل تلاوتك</h3><p className="mt-2 text-xs text-muted-foreground">{lastRead ? `سورة رقم ${lastRead.surah} · آية ${lastRead.ayah}` : 'ابدأ من حيث تحب'}</p></div><span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-foreground transition-transform group-hover:translate-x-1"><ChevronLeft size={22} /></span></Link>
          <Link href="/qibla" data-testid="link-home-qibla" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 transition-transform active:scale-[.98]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Compass size={18} /></span><span className="text-sm font-bold">اتجاه القبلة</span><span className="text-[11px] text-muted-foreground">اعرف الاتجاه بدقة</span></Link>
          <Link href="/adhkar" data-testid="link-home-adhkar" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 transition-transform active:scale-[.98]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/20 text-accent-foreground"><Sparkles size={18} /></span><span className="text-sm font-bold">أذكارك</span><span className="text-[11px] text-muted-foreground">ذكر يطمئن القلب</span></Link>
        </div>
      </section>
      <section className="rounded-2xl border border-dashed border-accent/50 bg-accent/5 p-4"><div className="flex gap-3"><TimerReset className="mt-0.5 shrink-0 text-accent" size={20} /><div><p className="text-sm font-bold">اجعلها عادة صغيرة</p><p className="mt-1 text-xs leading-6 text-muted-foreground">قراءة آية واحدة بخشوع خير من كثير بلا حضور. عد كل يوم إلى موضعك المحفوظ.</p></div></div></section>
    </main>
  </PageFrame>;
}

async function fetchSurahs(): Promise<Surah[]> {
  const response = await fetch('https://api.alquran.cloud/v1/surah');
  if (!response.ok) throw new Error();
  const json = await response.json();
  return json.data;
}
async function fetchSurah(number: string): Promise<{ surah: Surah; ayahs: Ayah[] }> {
  const response = await fetch(`https://api.alquran.cloud/v1/surah/${number}/quran-uthmani`);
  if (!response.ok) throw new Error();
  const json = await response.json();
  return { surah: json.data, ayahs: json.data.ayahs };
}
function QuranPage() {
  const { favorites, setFavorites, lastRead } = useApp();
  const [, setLocation] = useLocation();
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [search, setSearch] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const load = () => { setStatus('loading'); fetchSurahs().then((data) => { setSurahs(data); setStatus('ready'); }).catch(() => setStatus('error')); };
  useEffect(load, []);
  const filtered = surahs.filter((surah) => (surah.name.includes(search) || surah.englishName.toLowerCase().includes(search.toLowerCase()) || String(surah.number) === search) && (!onlyFavorites || favorites.includes(surah.number)));
  const toggleFavorite = (number: number) => setFavorites((current) => current.includes(number) ? current.filter((id) => id !== number) : [...current, number]);
  return <PageFrame title="القرآن">
    <main className="space-y-5 px-5">
      <section className="relative overflow-hidden rounded-[1.7rem] bg-secondary p-5"><div className="absolute -left-5 -top-8 h-32 w-32 rounded-full border border-accent/30" /><div className="relative"><p className="text-xs font-bold tracking-[.16em] text-accent">الورد المحفوظ</p><h2 className="mt-2 text-2xl font-extrabold">كتاب الله، رفيقك كل يوم</h2><p className="mt-2 max-w-[270px] text-xs leading-6 text-muted-foreground">تصفح السور بهدوء، واحفظ موضعك لتعود إليه دون تردد.</p>{lastRead && <button onClick={() => setLocation(`/quran/${lastRead.surah}`)} data-testid="button-continue-quran" className="mt-4 flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground">متابعة القراءة <ChevronLeft size={15} /></button>}</div></section>
      <div className="relative"><Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-search-surahs" aria-label="البحث في السور" placeholder="ابحث باسم السورة أو رقمها" className="h-12 w-full rounded-2xl border border-border bg-card pr-11 pl-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-accent/40" /></div>
      <div className="flex items-center justify-between"><SectionHeading eyebrow="المصحف الشريف" title="السور (١١٤)" /><button onClick={() => setOnlyFavorites((value) => !value)} data-testid="button-filter-favorites" className={`mb-1 flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold ${onlyFavorites ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground'}`}><Star size={15} fill={onlyFavorites ? 'currentColor' : 'none'} /> المفضلة</button></div>
      {status === 'error' ? <FriendlyError onRetry={load} message="تعذّر تحميل قائمة السور" /> : status === 'loading' ? <div className="space-y-2">{[1, 2, 3, 4, 5, 6].map((x) => <Skeleton key={x} className="h-[72px]" />)}</div> : filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-8 text-center"><Search className="mx-auto mb-3 text-muted-foreground" /><p className="font-bold">لا توجد نتائج</p><p className="mt-1 text-xs text-muted-foreground">جرّب كلمة بحث مختلفة.</p></div> : <div className="space-y-2">{filtered.map((surah) => <div key={surah.number} data-testid={`row-surah-${surah.number}`} className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-border bg-card px-3 transition-colors hover:border-accent/50"><button onClick={() => setLocation(`/quran/${surah.number}`)} data-testid={`button-open-surah-${surah.number}`} className="flex min-h-[60px] flex-1 items-center gap-3 text-right"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-bold text-muted-foreground">{surah.number}</span><span className="min-w-0 flex-1"><strong className="block font-arabic text-xl leading-7">{surah.name}</strong><span className="block text-[11px] text-muted-foreground">{surah.englishNameTranslation} · {surah.numberOfAyahs} آية</span></span><ChevronLeft className="shrink-0 text-muted-foreground" size={17} /></button><button onClick={() => toggleFavorite(surah.number)} data-testid={`button-favorite-surah-${surah.number}`} aria-label={`تفضيل سورة ${surah.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-accent">{favorites.includes(surah.number) ? <Star size={18} fill="currentColor" /> : <Star size={18} />}</button></div>)}</div>}
    </main>
  </PageFrame>;
}

function QuranReader() {
  const { id } = useParams<{ id: string }>();
  const { settings, setSettings, bookmarks, setBookmarks, setLastRead } = useApp();
  const [data, setData] = useState<{ surah: Surah; ayahs: Ayah[] } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = () => { if (!id) return; setStatus('loading'); fetchSurah(id).then((result) => { setData(result); setStatus('ready'); }).catch(() => setStatus('error')); };
  useEffect(load, [id]);
  useEffect(() => { if (id) setLastRead((current) => ({ surah: Number(id), ayah: current?.surah === Number(id) ? current.ayah : 1 })); }, [id]);
  const toggleBookmark = (ayah: number) => { const key = `${id}:${ayah}`; setBookmarks((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]); };
  return <PageFrame title={data?.surah.name ?? 'سورة'} back>
    <main className="px-5">
       <div className="mb-5 flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2"><div><p className="font-arabic text-xl">{data?.surah.name ?? 'جاري التحميل'}</p><p className="text-[11px] text-muted-foreground">{data ? `${data.surah.numberOfAyahs} آية · ${data.surah.revelationType === 'Meccan' ? 'مكية' : 'مدنية'}` : '...'}</p></div><div className="flex items-center gap-1"><button disabled={!RECITATION.enabled} data-testid="button-recitation" aria-label="التلاوة الصوتية قريباً" title={RECITATION.enabled ? `القارئ: ${RECITATION.defaultReciter}` : 'التلاوة الصوتية قريباً'} className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"><Volume2 size={16} /></button><button onClick={() => setSettings((s) => ({ ...s, fontSize: Math.max(23, s.fontSize - 2) }))} data-testid="button-font-decrease" aria-label="تصغير الخط" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"><Minus size={16} /></button><span className="w-8 text-center text-xs font-bold">{settings.fontSize}</span><button onClick={() => setSettings((s) => ({ ...s, fontSize: Math.min(42, s.fontSize + 2) }))} data-testid="button-font-increase" aria-label="تكبير الخط" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"><Plus size={16} /></button></div></div>
       <div className="mb-5 flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2"><div><p className="font-arabic text-xl">{data?.surah.name ?? 'جاري التحميل'}</p><p className="text-[11px] text-muted-foreground">{data ? `${data.surah.numberOfAyahs} آية · ${data.surah.revelationType === 'Meccan' ? 'مكية' : 'مدنية'}` : '...'}</p></div><div className="flex items-center gap-1"><button disabled={!RECITATION.enabled} data-testid="button-recitation" aria-label="التلاوة الصوتية قريباً" title={RECITATION.enabled ? `القارئ: ${RECITATION.defaultReciter}` : 'التلاوة الصوتية قريباً'} className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"><Volume2 size={16} /></button><button onClick={() => setSettings((s) => ({ ...s, fontSize: Math.max(23, s.fontSize - 2) }))} data-testid="button-font-decrease" aria-label="تصغير الخط" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"><Minus size={16} /></button><span className="w-8 text-center text-xs font-bold">{settings.fontSize}</span><button onClick={() => setSettings((s) => ({ ...s, fontSize: Math.min(42, s.fontSize + 2) }))} data-testid="button-font-increase" aria-label="تكبير الخط" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"><Plus size={16} /></button></div></div>
      {status === 'error' ? <FriendlyError onRetry={load} message="تعذّر فتح السورة" /> : status === 'loading' ? <div className="space-y-4">{[1, 2, 3].map((x) => <Skeleton key={x} className="h-36" />)}</div> : <><div className="mb-6 text-center"><div className="mx-auto mb-3 h-px w-20 bg-accent" /><p className="font-arabic text-3xl">{data?.surah.name}</p><p className="mt-1 text-xs text-muted-foreground">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p></div><div className="divide-y divide-border/80">{data?.ayahs.map((ayah) => { const key = `${id}:${ayah.numberInSurah}`; const marked = bookmarks.includes(key); return <article key={ayah.number} onClick={() => setLastRead({ surah: Number(id), ayah: ayah.numberInSurah })} data-testid={`article-ayah-${ayah.numberInSurah}`} className="group relative py-6"><p dir="rtl" className="font-arabic text-foreground leading-[2.15] transition-colors" style={{ fontSize: settings.fontSize }}>{ayah.text} <span className="mx-1 inline-grid h-8 w-8 translate-y-1 place-items-center rounded-full border border-accent/60 align-middle font-sans text-xs text-accent">{ayah.numberInSurah}</span></p><button onClick={() => toggleBookmark(ayah.numberInSurah)} data-testid={`button-bookmark-ayah-${ayah.numberInSurah}`} aria-label={`حفظ الآية ${ayah.numberInSurah}`} className={`mt-3 flex min-h-9 items-center gap-2 rounded-lg px-2 text-[11px] transition-opacity ${marked ? 'text-accent' : 'text-muted-foreground opacity-60 md:opacity-0 md:group-hover:opacity-100'}`}><Bookmark size={14} fill={marked ? 'currentColor' : 'none'} /> {marked ? 'محفوظة' : 'حفظ الآية'}</button></article>; })}</div></>}
    </main>
  </PageFrame>;
}

function QiblaPage() {
  const { coords, locationState, refreshLocation } = useApp();
  const [heading, setHeading] = useState<number | null>(null);
  const [sensorEnabled, setSensorEnabled] = useState(false);
  const bearing = qiblaBearing(coords);
  useEffect(() => {
    const listener = (event: DeviceOrientationEvent) => { const alpha = event.alpha; if (alpha !== null) setHeading(alpha); };
    window.addEventListener('deviceorientationabsolute', listener as EventListener);
    window.addEventListener('deviceorientation', listener as EventListener);
    return () => { window.removeEventListener('deviceorientationabsolute', listener as EventListener); window.removeEventListener('deviceorientation', listener as EventListener); };
  }, []);
  const enableSensor = async () => {
    const orientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
    if (orientation.requestPermission) { const result = await orientation.requestPermission(); if (result !== 'granted') return; }
    setSensorEnabled(true);
  };
  const displayAngle = heading === null || !sensorEnabled ? bearing : (bearing - heading + 360) % 360;
  return <PageFrame title="القبلة">
    <main className="space-y-5 px-5">
      <section className="rounded-[1.7rem] bg-primary p-6 text-center text-primary-foreground"><p className="text-xs text-primary-foreground/70">اتجاه مكة المكرمة من موقعك</p><div className="relative mx-auto my-6 grid h-56 w-56 place-items-center rounded-full border border-primary-foreground/20 pattern-star"><div className="absolute inset-4 rounded-full border border-primary-foreground/10" /><div className="absolute inset-0 transition-transform duration-500" style={{ transform: `rotate(${displayAngle}deg)` }}><div className="absolute left-1/2 top-3 -translate-x-1/2 text-accent"><Navigation size={28} fill="currentColor" /></div><div className="absolute left-1/2 top-1/2 h-[38%] w-px -translate-x-1/2 -translate-y-1/2 bg-accent/60" /></div><div className="relative grid h-16 w-16 place-items-center rounded-full bg-accent text-accent-foreground"><span className="font-arabic text-2xl">قبلة</span></div></div><p className="font-mono text-3xl font-bold">{Math.round(bearing)}°</p><p className="mt-1 text-xs text-primary-foreground/65">زاوية القبلة من الشمال الحقيقي</p></section>
      <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-border bg-card p-4"><MapPin className="mb-3 text-accent" size={20} /><p className="text-xs text-muted-foreground">إحداثياتك</p><p className="mt-1 font-mono text-xs">{coords.latitude.toFixed(3)}° ، {coords.longitude.toFixed(3)}°</p></div><div className="rounded-2xl border border-border bg-card p-4"><Compass className="mb-3 text-primary" size={20} /><p className="text-xs text-muted-foreground">البوصلة</p><p className="mt-1 text-xs font-bold">{sensorEnabled && heading !== null ? 'مفعّلة الآن' : 'وضع الزاوية'}</p></div></div>
      <div className="rounded-2xl border border-border bg-card p-4"><div className="flex gap-3"><Info className="mt-0.5 shrink-0 text-accent" size={18} /><div><p className="text-sm font-bold">لنتيجة أدق</p><p className="mt-1 text-xs leading-6 text-muted-foreground">أبعد الهاتف عن المعادن، ثم حرّكه في شكل رقم ٨ لمعايرة البوصلة. إن لم يدعم جهازك المستشعر، استخدم زاوية القبلة الظاهرة.</p></div></div><div className="mt-4 flex gap-2"><button onClick={enableSensor} data-testid="button-enable-compass" className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-xs font-bold text-primary-foreground"><Compass size={16} /> تفعيل البوصلة</button><button onClick={refreshLocation} data-testid="button-refresh-location-qibla" className="grid min-h-11 w-12 place-items-center rounded-xl bg-secondary" aria-label="تحديث الموقع"><LocateFixed size={17} /></button></div></div>
      {locationState === 'error' && <FriendlyError onRetry={refreshLocation} message="نحتاج إلى موقعك لحساب القبلة" />}
    </main>
  </PageFrame>;
}

function AdhkarPage() {
  const [tab, setTab] = useState<keyof typeof adhkarSets>('morning');
  const [progress, setProgress] = useLocalState<Record<string, number[]>>('mushaf-adhkar-progress', {});
  const current = adhkarSets[tab];
  const counts = progress[tab] ?? current.items.map(() => 0);
  const total = current.items.reduce((sum, item) => sum + item.count, 0);
  const complete = counts.reduce((sum, count) => sum + count, 0);
  const increment = (index: number) => setProgress((all) => ({ ...all, [tab]: counts.map((count, itemIndex) => itemIndex === index ? Math.min(current.items[itemIndex].count, count + 1) : count) }));
  const reset = () => setProgress((all) => ({ ...all, [tab]: current.items.map(() => 0) }));
  return <PageFrame title="الأذكار">
    <main className="space-y-5 px-5">
      <section className="rounded-[1.7rem] bg-secondary p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold tracking-[.16em] text-accent">ورد اليوم</p><h2 className="mt-2 text-2xl font-extrabold">{current.title}</h2><p className="mt-1 text-xs text-muted-foreground">{current.subtitle}</p></div><div className="grid h-14 w-14 place-items-center rounded-full border-4 border-accent/30 text-center"><span className="text-sm font-bold">{Math.round(total ? complete / total * 100 : 0)}%</span></div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${total ? complete / total * 100 : 0}%` }} /></div><div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>{complete} من {total}</span><button onClick={reset} data-testid="button-reset-adhkar" className="font-bold text-primary">إعادة التعيين</button></div></section>
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted p-1">{Object.entries(adhkarSets).map(([key, set]) => <button key={key} onClick={() => setTab(key as keyof typeof adhkarSets)} data-testid={`button-adhkar-tab-${key}`} className={`min-h-11 rounded-xl text-xs font-bold transition-colors ${tab === key ? 'bg-card text-primary soft-shadow' : 'text-muted-foreground'}`}>{set.title.replace('أذكار', '')}</button>)}</div>
      <div className="space-y-3">{current.items.map((item, index) => { const done = counts[index] >= item.count; return <button key={`${tab}-${index}`} onClick={() => increment(index)} disabled={done} data-testid={`button-adhkar-item-${index}`} className={`w-full rounded-2xl border p-5 text-right transition-all active:scale-[.99] ${done ? 'border-accent/30 bg-accent/5' : 'border-border bg-card hover:border-accent/50'}`}><div className="mb-4 flex items-center justify-between"><span className={`grid h-8 w-8 place-items-center rounded-full ${done ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground'}`}>{done ? <Check size={16} /> : <span className="text-xs font-bold">{index + 1}</span>}</span><span className="flex items-center gap-1 text-xs text-muted-foreground">{counts[index]} / {item.count} <span className="mr-1 h-1.5 w-1.5 rounded-full bg-accent" /></span></div><p className={`font-arabic text-xl leading-[2] ${done ? 'text-muted-foreground line-through decoration-accent/50' : ''}`}>{item.text}</p><p className="mt-3 text-[11px] font-bold text-accent">{done ? 'تم الذكر' : 'اضغط للتسبيح'}</p></button>; })}</div>
    </main>
  </PageFrame>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <button onClick={onChange} data-testid={`button-toggle-${label}`} role="switch" aria-checked={checked} aria-label={label} className={`relative h-7 w-12 rounded-full p-1 transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`}><span className={`block h-5 w-5 rounded-full bg-card transition-transform ${checked ? '-translate-x-5' : 'translate-x-0'}`} /></button>;
}
function SettingsPage() {
  const { settings, setSettings, refreshLocation, locationName, locationState } = useApp();
  const [installed, setInstalled] = useState(false);
  const [installEvent, setInstallEvent] = useState<Event | null>(null);
  useEffect(() => { const handler = (event: Event) => { event.preventDefault(); setInstallEvent(event); }; window.addEventListener('beforeinstallprompt', handler); return () => window.removeEventListener('beforeinstallprompt', handler); }, []);
  const install = async () => { const prompt = installEvent as (Event & { prompt?: () => Promise<void> }) | null; if (prompt?.prompt) { await prompt.prompt(); setInstalled(true); } };
  return <PageFrame title="الإعدادات">
    <main className="space-y-5 px-5">
      <section className="rounded-[1.7rem] bg-primary p-5 text-primary-foreground"><p className="text-xs text-primary-foreground/65">مساحتك، بطريقتك</p><h2 className="mt-2 text-2xl font-extrabold">إعدادات المصحف والصلاة</h2><p className="mt-2 text-xs leading-6 text-primary-foreground/70">تُحفظ تفضيلاتك على هذا الجهاز فقط، لتبقى تجربتك شخصية وسريعة.</p></section>
      <section><SectionHeading eyebrow="المظهر" title="راحة العين" /><div className="overflow-hidden rounded-2xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border p-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary">{settings.theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}</span><div><p className="text-sm font-bold">الوضع الداكن</p><p className="text-[11px] text-muted-foreground">ألوان أهدأ في الليل</p></div></div><Toggle checked={settings.theme === 'dark'} label="الوضع الداكن" onChange={() => setSettings((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))} /></div><div className="p-4"><div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-bold">حجم خط القرآن</p><p className="text-[11px] text-muted-foreground">اضبط القراءة كما تحب</p></div><span className="font-mono text-xs">{settings.fontSize}px</span></div><input type="range" min="23" max="42" step="1" value={settings.fontSize} onChange={(event) => setSettings((s) => ({ ...s, fontSize: Number(event.target.value) }))} data-testid="input-quran-font-size" aria-label="حجم خط القرآن" className="w-full accent-[hsl(var(--primary))]" /></div></div></section>
      <section><SectionHeading eyebrow="الصلاة" title="المواقيت والموقع" /><div className="overflow-hidden rounded-2xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border p-4"><div><p className="text-sm font-bold">طريقة الحساب</p><p className="mt-1 text-[11px] text-muted-foreground">تؤثر على مواقيت الفجر والعشاء</p></div><select value={settings.method} onChange={(event) => setSettings((s) => ({ ...s, method: event.target.value }))} data-testid="select-prayer-method" className="max-w-[165px] rounded-xl border border-border bg-secondary px-2 py-2 text-xs outline-none">{METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></div><div className="flex items-center justify-between p-4"><div className="flex items-center gap-3"><MapPin size={18} className="text-accent" /><div><p className="text-sm font-bold">الموقع الحالي</p><p className="mt-1 text-[11px] text-muted-foreground">{locationName}</p></div></div><button onClick={refreshLocation} disabled={locationState === 'loading'} data-testid="button-refresh-location-settings" className="flex min-h-10 items-center gap-1 rounded-xl bg-secondary px-3 text-xs font-bold">{locationState === 'loading' ? <RefreshCw size={14} className="animate-spin" /> : <LocateFixed size={14} />} تحديث</button></div></div></section>
      <section><SectionHeading eyebrow="التنبيهات" title="التذكير" /><div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent"><Bell size={17} /></span><div><p className="text-sm font-bold">تنبيهات الصلاة</p><p className="mt-1 text-[11px] text-muted-foreground">تفعيل الإشعارات عند دعم المتصفح</p></div></div><Toggle checked={settings.notifications} label="تنبيهات الصلاة" onChange={() => setSettings((s) => ({ ...s, notifications: !s.notifications }))} /></div></section>
      <section className="rounded-2xl border border-dashed border-accent/50 bg-accent/5 p-4"><div className="flex gap-3"><Download className="mt-0.5 shrink-0 text-accent" size={19} /><div className="flex-1"><p className="text-sm font-bold">ثبّت التطبيق على جهازك</p><p className="mt-1 text-xs leading-6 text-muted-foreground">افتح المصحف والصلاة بسرعة من الشاشة الرئيسية، ويعمل معك حتى عند ضعف الاتصال.</p>{installEvent && !installed ? <button onClick={install} data-testid="button-install-app" className="mt-3 min-h-10 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground">تثبيت التطبيق</button> : <p className="mt-3 text-xs font-bold text-primary">{installed ? 'تم إرسال طلب التثبيت' : 'من قائمة المتصفح اختر «إضافة إلى الشاشة الرئيسية»'}</p>}</div></div></section>
      <div className="flex items-center justify-center gap-2 pb-4 text-[11px] text-muted-foreground"><SlidersHorizontal size={14} /> المصحف والصلاة · إصدار ١.٠</div>
    </main>
  </PageFrame>;
}

function NotFoundPage() {
  return <PageFrame title="الصفحة غير موجودة"><main className="px-5"><div className="rounded-2xl border border-border bg-card p-8 text-center"><WifiOff className="mx-auto mb-3 text-muted-foreground" size={28} /><h2 className="text-lg font-bold">هذه الصفحة غير موجودة</h2><Link href="/" data-testid="link-not-found-home" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground">العودة للرئيسية</Link></div></main></PageFrame>;
}

function Router() {
  return <Switch><Route path="/" component={HomePage} /><Route path="/quran" component={QuranPage} /><Route path="/quran/:id" component={QuranReader} /><Route path="/qibla" component={QiblaPage} /><Route path="/adhkar" component={AdhkarPage} /><Route path="/settings" component={SettingsPage} /><Route component={NotFoundPage} /></Switch>;
}
function App() {
  return <AppShell><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></AppShell>;
}
export default App;