# عقاركم (AqarCom) — الباك اند الكامل

الخادم الخلفي لمنصة «عقاركم»: سوق عقاري للأفراد (B2C) + بيئة مناقصات ومقاولات (B2B) مع فرز كمّي بنموذج المجموع الموزون (WSM).

```
aqarcom-backend/
├── server/            ← الخادم الرئيسي: Node.js + Express + MongoDB (Mongoose)
│   └── admin-dashboard/  ← لوحة تحكم الإدارة (HTML + CSS + JavaScript) — تُفتح على /dashboard
├── scoring-service/   ← خدمة الفرز: Python + FastAPI + NumPy/Pandas (شبكة داخلية فقط)
├── android-client/    ← ملفات Java جاهزة للنسخ إلى Android Studio (Retrofit + OkHttp)
├── deploy/nginx.conf  ← HTTPS + TLS 1.3 للإنتاج
└── docker-compose.yml ← تشغيل كل شيء بأمر واحد
```

---

## 1. التشغيل السريع

### الطريقة (أ) — Docker (الأسهل)
```bash
cp server/.env.example server/.env
docker compose up -d --build
docker compose exec api npm run seed        # بيانات تجريبية
```

### الطريقة (ب) — بدون Docker
المتطلبات: **Node.js 18+** و **MongoDB 6+** و **Python 3.10+**.

```bash
# 1) خدمة الفرز
cd scoring-service
python -m venv .venv
.venv\Scripts\activate            # على ويندوز   |   source .venv/bin/activate  على لينكس/ماك
pip install -r requirements.txt
uvicorn app.main:app --port 8001

# 2) الخادم الرئيسي (نافذة ثانية)
cd server
npm install
cp .env.example .env              # على ويندوز: copy .env.example .env
npm run seed                      # يمسح القاعدة ويملؤها ببيانات تجريبية
npm run dev
```

- الخادم: `http://localhost:3000`
- **توثيق Swagger التفاعلي:** `http://localhost:3000/api-docs` ← جرّب كل Endpoint من المتصفح
- فحص الحالة: `http://localhost:3000/health`

### الحسابات التجريبية (بعد `npm run seed`) — كلمة المرور لجميعها: `Passw0rd!`

| الدور | البريد |
|---|---|
| مدير النظام (للوحة التحكم) | admin@aqarcom.app |
| مستخدم فردي | user@aqarcom.app |
| مالك عقار | owner@aqarcom.app |
| صاحب مشروع | project@aqarcom.app |
| متعهد موثّق | contractor1@aqarcom.app ، contractor2 ، contractor3 |
| حسابات بانتظار الموافقة | contractor4@aqarcom.app ، pending.owner@aqarcom.app ، pending.project@aqarcom.app |

تتضمن البيانات 8 عقارات بإحداثيات حقيقية (دمشق، ريف دمشق، حلب، حمص)، ومناقصة مفتوحة عليها 3 عروض، و**مناقصة تُغلق تلقائياً بعد دقيقتين** من التشغيل لعرض الإغلاق الآلي والفرز مباشرةً أمام اللجنة، ومسودة مناقصة.

إنشاء مدير جديد (المدير لا يُسجَّل من التطبيق):
```bash
npm run create-admin -- admin2@aqarcom.app "StrongPass123" "اسم المدير"
```

---

## 2. لوحة تحكم الإدارة (Dashboard)

افتح **`http://localhost:3000/dashboard`** وسجّل الدخول بحساب مدير (`admin@aqarcom.app` / `Passw0rd!`). الملفات في `server/admin-dashboard/` (HTML + CSS + JavaScript بدون أي مكتبات)، والخادم نفسه يقدّمها فلا تحتاج أي إعداد إضافي.

### تفعيل الحسابات — من لوحة التحكم حصراً
| الدور عند التسجيل | الحالة الابتدائية |
|---|---|
| مستخدم فردي (`user`) | `active` مباشرة |
| مالك عقار، صاحب مشروع، متعهد | **`pending`** — بلا أي صلاحية حتى يوافق المدير |

- الحساب `pending` يستطيع تسجيل الدخول (ليعرض التطبيق شاشة «بانتظار الموافقة»)، لكن **كل** عملية ذات صلاحية تُرفض بـ `403 ACCOUNT_PENDING_APPROVAL`. الاستثناء الوحيد: المتعهد يستطيع رفع وثائق التوثيق كي يراجعها المدير قبل التفعيل.
- الانتقالات المسموحة: موافقة (`pending/rejected → active`)، رفض بسبب إلزامي (`pending → rejected`)، إيقاف بسبب إلزامي (`active/pending → suspended`)، إعادة تفعيل (`suspended → active`)، وتغيير الدور.
- الرفض والإيقاف يسجّلان خروج المستخدم من كل الأجهزة ويمنعان الدخول، وكل قرار يُرسَل للمستخدم كإشعار ويُحفظ في سجل التدقيق.
- تطبيق Android **لا يحتوي** أي استدعاء لتغيير حالة الحسابات؛ هذه العمليات موجودة في لوحة التحكم فقط.
- لتطبيق الموافقة على المستخدم الفردي أيضاً: `ACCOUNT_APPROVAL_ROLES=user,property_owner,project_owner,contractor` في `.env`.

### صفحات اللوحة
| الصفحة | ما تفعله |
|---|---|
| نظرة عامة | مؤشرات تجميعية (FR-28) + تنبيه بعدد الطلبات المعلّقة |
| طلبات التفعيل | قائمة الحسابات `pending` مع زر موافقة / رفض |
| المستخدمون | بحث وفلترة بالدور والحالة، تفاصيل كل حساب، سجل قراراته ومحاولات دخوله، إيقاف / إعادة تفعيل / تغيير دور |
| التوثيق الهندسي | عرض الوثائق المشفّرة، اعتماد أو رفض مع السبب (FR-24) |
| الإعلانات العقارية | إخفاء / حذف / استعادة مع السبب، صور الإعلان، السجل الإشرافي (FR-27) |
| المناقصات | ضبط المحتوى، الأوزان والمواعيد، قائمة الترشيح والعرض المُرسّى |

اللوحة عربية بالكامل من اليمين لليسار، بألوان الدراسة التصميمية وخط Tajawal، وتعمل على الشاشات الصغيرة.

---

## 3. الربط مع Android Studio

1. انسخ مجلد `android-client/app/src/main/java/com/aqarcom/app/` إلى مشروعك (أو غيّر اسم الحزمة `com.aqarcom.app` لتطابق مشروعكم).
2. انسخ `android-client/app/src/main/res/xml/network_security_config.xml` إلى `res/xml/`.
3. أضف الاعتماديات من `android-client/gradle-dependencies.txt` إلى `app/build.gradle`.
4. ادمج `android-client/AndroidManifest-snippet.xml` في `AndroidManifest.xml` (صلاحية INTERNET و`android:name=".AqarComApp"` و`networkSecurityConfig`).
5. عدّل `BASE_URL` في `data/network/ApiConfig.java`:
   - **المحاكي (Emulator):** `http://10.0.2.2:3000/api/v1/` (الافتراضي)
   - **هاتف حقيقي على نفس الشبكة:** `http://<IP جهاز الكمبيوتر>:3000/api/v1/` (اعرف الـ IP بالأمر `ipconfig`)، وأضف هذا الـ IP في `network_security_config.xml`.
   - وعدّل `PUBLIC_BASE_URL` في `server/.env` للقيمة نفسها (بدون `/api/v1`) كي تعمل روابط الصور.

### محتوى ملفات Android

| الملف | الوظيفة |
|---|---|
| `network/ApiClient.java` | نسخة Retrofit واحدة: `ApiClient.properties()`، `ApiClient.tenders()`… |
| `network/TokenManager.java` | حفظ رموز JWT والمستخدم الحالي + `canSeeTenders()` لإخفاء قسم المناقصات (NFR-04) |
| `network/AuthInterceptor.java` | يضيف `Authorization: Bearer …` تلقائياً |
| `network/TokenAuthenticator.java` | عند 401 يجدّد الرمز تلقائياً ويعيد الطلب |
| `network/ApiCallback.java` | يفكّ غلاف `{success, data, meta}` ويعطيك `onSuccess` / `onError` |
| `network/ErrorParser.java` | يحوّل الخطأ إلى `ApiError` فيه `code` ثابت ورسالة عربية جاهزة للعرض |
| `network/MultipartUtil.java` + `ProgressRequestBody.java` | رفع الصور والملفات من `Uri` مع شريط تقدّم |
| `upload/ChunkedUploader.java` | رفع دفتر الشروط على أجزاء **مع الاستئناف بعد انقطاع الاتصال** (NFR-01) |
| `push/AqarFirebaseService.java` | استقبال الإشعارات الفورية (اختياري، يحتاج Firebase) |
| `api/*.java` | واجهات Retrofit لكل وحدة (8 واجهات) |
| `model/*.java` | 41 صنف بيانات مطابق لـ JSON الخادم |
| `ApiUsageExamples.java` | **أمثلة جاهزة للنسخ** لكل شاشة: الدخول، البحث، الخريطة، الاتصال/واتساب، نشر إعلان، طرح مناقصة، تقديم عرض، التوثيق، قائمة الترشيح والإرساء |

مثال:
```java
ApiClient.properties().get(id).enqueue(new ApiCallback<Property>() {
    @Override public void onSuccess(Property p, PageMeta meta) { bind(p); }
    @Override public void onError(ApiError e) { Snackbar.make(root, e.message, LENGTH_LONG).show(); }
});
```

### أكواد الأخطاء المهمة للواجهة (`error.code`)
| الكود | التصرف المقترح في التطبيق |
|---|---|
| `TOKEN_EXPIRED` | يُعالَج تلقائياً عبر TokenAuthenticator |
| `INVALID_CREDENTIALS` | رسالة عامة عمداً (لا تكشف أيّ الحقلين خاطئ) |
| `ACCOUNT_PENDING_APPROVAL` | شاشة «حسابك بانتظار موافقة الإدارة» |
| `ACCOUNT_REJECTED` / `ACCOUNT_SUSPENDED` | الرسالة تتضمن السبب؛ سجّل خروج المستخدم |
| `ACCOUNT_LOCKED` | `details.retryAfterSeconds` — عدّاد انتظار |
| `VALIDATION_ERROR` | `e.fieldNames()` — لوّن الحقول الخاطئة |
| `CONTRACTOR_NOT_VERIFIED` | افتح شاشة التوثيق (`details.redirect = "verification"`) |
| `TENDER_CLOSED` | «انتهى موعد الإغلاق حسب توقيت الخادم» |
| `WEIGHTS_INVALID` | `details.suggestion` فيه القيمة المصحّحة |
| `FILE_TOO_LARGE` / `UNSUPPORTED_FILE_TYPE` | الرسالة تتضمن الحد الأقصى والصيغ المقبولة |
| `TENDER_ALREADY_AWARDED` | المناقصة مقفلة نهائياً |

> **الوقت:** اعتمد دائماً `secondsRemaining` و`serverTime` القادمين من الخادم للعدّاد التنازلي، لا ساعة الهاتف (BR-11).

---

## 4. الواجهات البرمجية (ملخص) — القاعدة: `/api/v1`

| الوحدة | أهم المسارات |
|---|---|
| المصادقة | `POST /auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout` · `/auth/forgot-password` · `/auth/reset-password` · `GET/PATCH /auth/me` · `POST /auth/device-token` |
| العقارات | `GET /properties` (بحث وفلترة وترتيب) · `GET /properties/map` (دبابيس الخريطة) · `POST /properties` · `PATCH/DELETE /properties/:id` · `POST /properties/:id/images` · `GET /properties/:id/contact` · `GET /properties/favorites` · `POST/DELETE /properties/:id/favorite` |
| المناقصات | `GET /tenders` · `GET /tenders/mine` · `POST /tenders` · `PATCH /tenders/:id` · `POST /tenders/:id/publish` · `/extend` · `/cancel` · `POST/GET /tenders/:id/documents` · `GET /tenders/:id/documents/latest/download` |
| العروض | `POST /tenders/:id/bids` · `GET /bids/mine` · `PATCH /bids/:id` · `POST /bids/:id/withdraw` |
| الفرز والإرساء | `GET /tenders/:id/shortlist` · `POST /tenders/:id/award` |
| الرفع المجزّأ | `POST /uploads` · `PUT /uploads/:id/chunks/:index` · `GET /uploads/:id` |
| التوثيق | `POST /verification` · `GET /verification/me` |
| الإشعارات | `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/:id/read` · `POST /notifications/read-all` |
| الإدارة | `POST /admin/users/:id/approve` · `/reject` · `/suspend` · `/reactivate` · `/role` · `GET /admin/users/:id` · `GET /admin/stats` · `GET /admin/review-queue` · `POST /admin/properties/:id/moderate` · `POST /admin/tenders/:id/moderate` · `GET /admin/verifications` · `POST /admin/verifications/:id/decision` · `GET /admin/users` · `POST /admin/users/:id/status` |
| عام | `GET /meta` (القوائم والحدود ووقت الخادم) |

التفاصيل الكاملة مع أمثلة الطلب والاستجابة في Swagger: `/api-docs` (والمواصفة الخام: `/api-docs.json` أو `server/src/docs/openapi.yaml`).

**الأدوار وقسم المناقصات:** قسم `/tenders` كاملاً يعيد **403** لدور `user` و`property_owner` (NFR-04)، ومتاح لـ `project_owner` و`contractor` و`admin`.

---

## 5. دورة حياة المناقصة

```
draft ──publish──▶ open ──(الموعد حسب ساعة الخادم)──┬──▶ closed_no_bids   (لا عروض — لا تدخل الفرز)
  │                  │                                └──▶ evaluating ──▶ shortlist_ready ──award──▶ awarded
  └──cancel──────────┴──cancel─────────────────────────────────────────────┘──▶ cancelled
```

- **الإغلاق الآلي:** مهمة `node-cron` كل دقيقة (`src/jobs/scheduler.js`)، إضافةً إلى «إغلاق كسول» فوري عند أي محاولة تقديم/تعديل/سحب أو فتح المناقصة بعد الموعد.
- كل انتقال حالة هو تحديث ذرّي مشروط، فلا تُعالج المناقصة مرتين ولا يُرسى عليها مرتين.
- **الفرز:** الخادم يستدعي خدمة Python (`POST /v1/evaluate`) بمهلة 3 ثوانٍ؛ عند تعذّرها يعمل **المقيّم الاحتياطي** (`src/services/evaluation/wsm.js`) بالمعادلات نفسها حرفياً، وتُوسَم النتيجة بـ `wsm` أو `fallback`. التصميم بنمط Strategy (`engines.js`).
- خدمة الفرز **لا تتصل بقاعدة البيانات إطلاقاً** (BR-16): تستلم أرقاماً وتعيد ترتيباً.
- مناقصة عالقة في `evaluating` (انقطاع أثناء الفرز) تُعاد معالجتها تلقائياً بعد دقيقتين.

---

## 6. تغطية المتطلبات

| المتطلب | أين نُفّذ |
|---|---|
| FR-01 → FR-04 | `services/auth.service.js` — JWT (HS256) + Refresh Token، Bcrypt بعامل 12، رمز من 6 أرقام لمرة واحدة بالبريد، حظر مؤقت بعد 5 محاولات مع إشعار |
| FR-05 → FR-09 | `services/property.service.js` — فهرس `2dsphere`، فلترة، ترتيب (الأحدث/السعر/الأقرب)، المفضلة |
| FR-10 → FR-16 | `services/tender.service.js` + `bid.service.js` — الأوزان = 100، دفتر الشروط ≤ 20MB بإصدارات مرقّمة، تمديد واحد، سحب العرض |
| FR-17 → FR-21 | `services/lifecycle.service.js` + `services/evaluation/*` + `scoring-service/` |
| FR-22 → FR-24 | `services/verification.service.js` — تخزين الوثائق **مشفّرة AES-256-GCM** |
| FR-25 | `GET /properties/:id/contact` يعيد `telUri` و`whatsappUrl` جاهزين |
| FR-26 | إشعار لصاحب المشروع عند كل عرض جديد |
| FR-27 → FR-28 | `services/admin.service.js` + سجل تدقيق `ModerationLog` |
| NFR-01 | رفع مجزّأ قابل للاستئناف (`/uploads`) + شريط تقدّم في Android |
| NFR-02 / BR-01 | Bcrypt، والحقل `passwordHash` لا يُعاد في أي استجابة |
| NFR-03 | `ENFORCE_HTTPS=true` + `deploy/nginx.conf` (TLS 1.3 فقط) + 401 للرمز المنتهي |
| NFR-04 | قسم المناقصات مقفل على الأدوار B2B |
| NFR-07 | الوسائط قائمة مُنمَّطة `media[].kind` (image / video / 3d_tour) |
| NFR-17 | Swagger + طبقات Routes → Controllers → Services → Models + تعليقات توثيقية |
| CN-08 / BR-20 | لا حذف فعلي: `status = deleted` |

**قواعد العمل الجوهرية:** BR-08 (تجميد الأوزان: `frozenWeights` لحظة الإغلاق، ومنع تعديلها بعد ورود عروض)، BR-11 (ساعة الخادم فقط)، BR-12 (المتعهد لا يرى عروض منافسيه، وصاحب المشروع لا يرى محتوى العروض قبل الإغلاق)، BR-16 (خدمة الفرز بلا قاعدة بيانات)، BR-19 (الحسم: الأقل سعراً ثم الأقدم تقديماً).

### قيم المسائل المفتوحة (SRS 10-2) — كلها قابلة للتعديل من `.env`
| المسألة | القيمة المعتمدة |
|---|---|
| OI-01 محاولات الدخول | 5 محاولات ← حظر 15 دقيقة |
| OI-02 صلاحية JWT | Access ساعة واحدة + Refresh 30 يوماً مع تدوير (كل Refresh يُستعمل مرة) |
| OI-03 صور العقار | 10 صور كحد أقصى، 5 MB للصورة، JPG/PNG/WEBP |
| OI-04 مهلة خدمة الفرز | 3000 ms ثم المقيّم الاحتياطي |
| OI-05 أرشفة الإشعارات | لم تُنفَّذ أرشفة آلية في هذه النسخة |

> **ملاحظة:** المقترح يذكر «فرز احتياطي عبر SQL»، لكن القاعدة MongoDB، فالمقيّم الاحتياطي مكتوب بـ JavaScript داخل النواة وينتج النتيجة نفسها. يُستحسن تعديل هذه العبارة في المقترح.

---

## 7. الاختبارات

```bash
# خدمة الفرز
cd scoring-service && pytest -q                      # 5 اختبارات

# الخادم (يحتاج MongoDB، ويُفضّل تشغيل خدمة الفرز)
cd server && MONGO_URI_TEST=mongodb://127.0.0.1:27017/aqarcom_test npm test   # 34 اختباراً
```

اختبارات الخادم (`server/tests/api.test.js`) تغطي حالات الاختبار في وثيقة SRS من **TC-01 إلى TC-14** كلها، إضافةً إلى سير تفعيل الحسابات من لوحة التحكم والرفع المجزّأ وتشفير الملفات وتدوير الرموز.

**تنبيه صريح:** شُغّلت الاختبارات أثناء التطوير على قاعدة متوافقة مع بروتوكول MongoDB لا تدعم الاستعلامات الجغرافية، لذا **لم يُختبر آلياً** مساران فقط: `GET /properties/map` والترتيب `sort=nearest`. كلاهما يستعمل ميزات MongoDB القياسية (`$geoWithin` و`$geoNear` مع فهرس `2dsphere`)؛ جرّبوهما يدوياً من Swagger بعد `npm run seed` على MongoDB حقيقي.

---

## 8. ملاحظات للنشر والإنتاج
- غيّر `JWT_ACCESS_SECRET` و`JWT_REFRESH_SECRET` و`FILE_ENCRYPTION_KEY` (الخادم يرفض الإقلاع في وضع production بالقيم الافتراضية).
- اضبط `SMTP_*` لإرسال رموز استعادة كلمة المرور؛ بدونها يُطبع الرمز في سجل الخادم (مفيد للتطوير).
- للإشعارات الفورية: أنشئ مشروع Firebase وضع مسار ملف Service Account في `FCM_SERVICE_ACCOUNT_PATH`. بدونها تبقى الإشعارات محفوظة وتظهر عند فتح التطبيق (SRS 2-1).
- **احفظوا نسخة احتياطية من `FILE_ENCRYPTION_KEY`**: ضياعه يعني تعذّر فك دفاتر الشروط ووثائق التوثيق المخزّنة.
