# رواء | RAWAA — Backend

Express + TypeScript + MongoDB. مشروع مستقل تمامًا، لا يعتمد على أي حزمة خارجه.

## التشغيل محليًا

```bash
npm install
cp .env.example .env      # املأ القيم
npm run seed              # ينشئ المدير والخدمات والأسعار والمحتوى الافتراضي
npm run dev               # http://localhost:4000
```

تحقق من العمل: `curl http://localhost:4000/api/health`

## النشر على Railway

1. اربط الـ repo (Root Directory = جذر هذا المشروع).
2. أضف متغيرات البيئة من `.env.example`.
3. Railway يلتقط `nixpacks.toml` تلقائيًا. لا توجد خطوة build — يعمل عبر `tsx` مباشرة.
4. بعد أول نشر شغّل مرة واحدة: `npm run seed`

**`CORS_ORIGINS` يجب أن يطابق دومين Netlify حرفًا بحرف، بدون `/` في النهاية.**
هذا أكثر سبب لفشل تسجيل الدخول بلا رسالة واضحة.

## استعادة حساب المدير

```bash
npm run admin:reset -- --email admin@rawaa.jo --password "كلمة-مرور-قوية"
```

ينشئ الحساب إن لم يوجد، أو يعيّن كلمة مرور جديدة ويُنهي كل الجلسات.
لا يوجد مسار استعادة مكشوف على الإنترنت — الوصول إلى Railway هو التوثيق.

## ملاحظة على التشغيل

يعمل عبر `tsx` بدل الترجمة إلى JavaScript. السبب: خطأ نوع واحد لا يجب أن يُسقط النشر.
للتحقق من الأنواع متى شئت: `npm run typecheck`.
للتحويل إلى بناء مُترجَم لاحقًا: غيّر `noEmit` إلى `false` في `tsconfig.json`، واجعل
`build` هو `tsc` و`start` هو `node dist/index.js`.

## القواعد المفروضة في الكود

1. الأسعار مصدرها قاعدة البيانات — `seed.ts` يزرعها مرة واحدة ثم تُدار من لوحة التحكم.
2. الإجمالي والخصم يُحسبان في الخادم؛ ما يرسله المتصفح من أسعار يُتجاهل.
3. الأسرار لا تدخل قاعدة البيانات — حارس في `/api/settings` يرفض أي مفتاح يطابق
   `secret|password|token|apiKey|credential|private`.
4. حالة الدفع مستقلة عن حالة الطلب، وكل تغيير يُسجَّل في `PaymentStatusHistory`.
