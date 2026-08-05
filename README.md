# پناه | Paanaah

[فارسی](#فارسی) · [English](#english)

## فارسی

پناه یک پیام‌رسان و شبکه اجتماعی فارسی، راست‌به‌چپ و قابل نصب به‌صورت PWA است. بک‌اند با Node.js و Express ساخته شده، رویدادهای بلادرنگ را Socket.IO مدیریت می‌کند و داده‌ها در Redis یا ذخیره‌ساز محلی JSON نگهداری می‌شوند.

### امکانات

#### حساب و پروفایل

- ثبت‌نام و ورود با شماره موبایل/نام کاربری و رمز عبور
- هش امن رمز عبور با `scrypt` و احراز هویت مبتنی بر JWT
- زیرساخت ورود با رمز یک‌بارمصرف و وب‌هوک اختیاری
- ویرایش نام، بیوگرافی و تصویر پروفایل
- نمایش وضعیت آنلاین و آخرین بازدید

#### پیام‌رسانی

- گفت‌وگوی مستقیم بلادرنگ با Socket.IO
- وضعیت ارسال، تحویل و خوانده‌شدن پیام
- نمایش وضعیت «در حال تایپ»
- پاسخ به پیام، ویرایش، حذف و پاک‌کردن تاریخچه گفتگو
- واکنش ایموجی و قالب‌بندی متن به‌صورت ضخیم، مورب، زیرخط و لینک
- پیام زمان‌بندی‌شده و پیام محوشونده با زمان انقضای انتخابی
- صفحه‌بندی تاریخچه پیام‌ها و جلوگیری از ارسال تکراری

#### رسانه و پیوست

- ارسال هم‌زمان چند پیوست، تا ۱۰ مورد برای هر پیام
- آپلود عکس، ویدئو، صوت و فایل عمومی با نمایش پیشرفت و امکان لغو
- ضبط و ارسال پیام صوتی در مرورگر
- پخش‌کننده اختصاصی صوت و ویدئو
- ساخت نسخه بهینه و تصویر بندانگشتی برای تصاویر
- اشتراک‌گذاری موقعیت مکانی و کارت تماس
- پشتیبانی از آپلود عادی و پروتکل آپلود ازسرگرفتنی TUS

#### ارتباطات اجتماعی

- جست‌وجو و مدیریت مخاطبین
- ارسال، پذیرش و رد درخواست دوستی
- صندوق ورودی برای پیام افراد خارج از مخاطبین
- اعلان‌های داخلی و فیلتر اعلان‌های خوانده‌نشده
- ایجاد و نمایش پست و استوری در API و پروفایل

#### PWA و تجربه کاربری

- رابط فارسی و واکنش‌گرا با چند پوسته رنگی
- نصب روی موبایل و دسکتاپ از طریق Web App Manifest
- کش منابع ثابت و اجرای پوسته برنامه در حالت آفلاین
- ذخیره محلی پیام‌ها و صف ارسال آفلاین با IndexedDB
- همگام‌سازی خودکار پیام‌های صف‌شده پس از بازگشت اتصال
- اعلان Push برای پیام‌ها و درخواست‌های دوستی

### فناوری‌ها

- Node.js، Express و Socket.IO
- Redis با جایگزین خودکار ذخیره‌ساز JSON محلی
- JWT و `crypto.scrypt`
- Service Worker، IndexedDB و Web Push
- Multer، TUS و Jimp برای آپلود و پردازش فایل
- HTML، CSS و JavaScript بدون فریم‌ورک در سمت کاربر

### راه‌اندازی محلی

پیش‌نیاز: Node.js 18 یا جدیدتر.

```bash
npm install
```

فایل `.env.example` را با نام `.env` کپی کنید و حداقل یک مقدار تصادفی و طولانی برای `JWT_SECRET` قرار دهید. سپس برنامه را اجرا کنید:

```bash
npm start
```

برنامه به‌صورت پیش‌فرض در `http://127.0.0.1:3000` در دسترس است. بدون `REDIS_URL`، داده‌ها در `data/local-store.json` ذخیره می‌شوند. برای اعلان‌های Push باید جفت کلید VAPID را در متغیرهای محیطی تنظیم کنید.

### متغیرهای محیطی

| متغیر | کاربرد | الزامی |
| --- | --- | --- |
| `PORT` | پورت HTTP؛ مقدار پیش‌فرض ۳۰۰۰ | خیر |
| `JWT_SECRET` | امضای توکن‌های ورود | برای محیط واقعی بله |
| `REDIS_URL` | آدرس Redis؛ در نبود آن ذخیره‌ساز محلی فعال می‌شود | خیر |
| `VAPID_PUBLIC_KEY` | کلید عمومی اعلان Push | خیر |
| `VAPID_PRIVATE_KEY` | کلید خصوصی اعلان Push | خیر |
| `OTP_WEBHOOK_URL` | وب‌هوک ارسال رمز یک‌بارمصرف | خیر |
| `ADMIN_CODE` | کد ورود مدیریتی قدیمی | خیر |
| `CUSTOMER_CODE` | کد ورود کاربری قدیمی | خیر |

### نکات استقرار و امنیت

- فایل `.env`، داده‌های محلی و فایل‌های آپلودشده عمداً از Git خارج شده‌اند.
- مقدار پیش‌فرض `JWT_SECRET` فقط برای توسعه است؛ در محیط واقعی حتماً آن را تغییر دهید.
- سرور فعلاً روی `127.0.0.1` گوش می‌دهد. برای دسترسی عمومی، آن را پشت یک reverse proxy اجرا کنید یا آدرس bind را متناسب با محیط استقرار تغییر دهید.
- پیش از استفاده واقعی، مبدأهای CORS، rate limiting، محدودیت نوع و حجم فایل و سیاست نگهداری داده را متناسب با محیط خود سخت‌گیرانه‌تر کنید.

### مجوز

این پروژه با مجوز ISC منتشر شده است.

---

## English

Paanaah is a Persian, right-to-left messaging and social networking application that can be installed as a Progressive Web App. Its backend is built with Node.js and Express, Socket.IO powers real-time events, and application data can be stored in Redis or the built-in local JSON store.

### Features

#### Accounts and profiles

- Registration and sign-in with a mobile number/username and password
- Secure password hashing with `scrypt` and JWT-based authentication
- One-time-password flow with an optional delivery webhook
- Editable name, biography, and profile picture
- Online presence and last-seen information

#### Messaging

- Real-time direct conversations powered by Socket.IO
- Sent, delivered, and seen message states
- Live typing indicators
- Reply, edit, delete, and clear-conversation actions
- Emoji reactions and rich text with bold, italic, underline, and links
- Scheduled messages and disappearing messages with selectable expiration times
- Paginated message history and duplicate-send protection

#### Media and attachments

- Multiple attachments per message, limited to 10 items
- Image, video, audio, and general file uploads with progress and cancellation
- In-browser voice-message recording
- Custom audio and video players
- Optimized images and thumbnail generation
- Location and contact-card sharing
- Standard multipart uploads and resumable TUS uploads

#### Social features

- Contact search and management
- Send, accept, and reject friend requests
- Inbox for messages from people outside the contact list
- In-app notifications with an unread filter
- Post and story creation and retrieval through the API and profile views

#### PWA and user experience

- Responsive Persian interface with multiple color themes
- Mobile and desktop installation through a Web App Manifest
- Static asset caching and an offline application shell
- IndexedDB message cache and offline outbox
- Automatic delivery of queued messages when connectivity returns
- Push notifications for messages and friend requests

### Technology stack

- Node.js, Express, and Socket.IO
- Redis with an automatic local JSON-store fallback
- JWT and `crypto.scrypt`
- Service Worker, IndexedDB, and Web Push
- Multer, TUS, and Jimp for file upload and processing
- Framework-free HTML, CSS, and JavaScript on the client

### Local setup

Requirement: Node.js 18 or newer.

```bash
npm install
```

Copy `.env.example` to `.env` and set at least a long, random value for `JWT_SECRET`. Then start the application:

```bash
npm start
```

The application is available at `http://127.0.0.1:3000` by default. When `REDIS_URL` is not configured, data is stored in `data/local-store.json`. To enable browser push notifications, configure a VAPID key pair in the environment.

### Environment variables

| Variable | Purpose | Required |
| --- | --- | --- |
| `PORT` | HTTP port; defaults to 3000 | No |
| `JWT_SECRET` | Signs authentication tokens | Yes in production |
| `REDIS_URL` | Redis connection URL; enables Redis instead of local storage | No |
| `VAPID_PUBLIC_KEY` | Public Web Push key | No |
| `VAPID_PRIVATE_KEY` | Private Web Push key | No |
| `OTP_WEBHOOK_URL` | Webhook used to deliver one-time passwords | No |
| `ADMIN_CODE` | Legacy administrator sign-in code | No |
| `CUSTOMER_CODE` | Legacy customer sign-in code | No |

### Deployment and security notes

- `.env`, local runtime data, and uploaded files are intentionally excluded from Git.
- The default `JWT_SECRET` is for development only; always replace it in production.
- The server currently binds to `127.0.0.1`. For public access, run it behind a reverse proxy or adjust the bind address for your deployment environment.
- Before production use, tighten the CORS origins, add rate limiting, enforce file type and size rules, and define an appropriate data-retention policy.

### License

Released under the ISC License.
