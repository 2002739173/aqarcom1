/**
 * Demo data for development and the viva demonstration.
 * Usage: npm run seed      (WARNING: wipes the configured database)
 * All demo accounts use the password:  Passw0rd!
 */
const bcrypt = require('bcrypt');
const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const fileStore = require('../utils/fileStore');
const models = require('../models');
const tenderSvc = require('../services/tender.service');
const bidSvc = require('../services/bid.service');

const PASSWORD = 'Passw0rd!';
const PDF = Buffer.from('%PDF-1.4\n% AqarCom demo specification book\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF');

(async () => {
  await fileStore.ensureDirs();
  await connectDB();
  await models.User.db.dropDatabase();
  await Promise.all(Object.values(models).map((m) => m.syncIndexes().catch(() => {})));
  const passwordHash = await bcrypt.hash(PASSWORD, env.bcryptRounds);

  const mk = (o) => models.User.create({ passwordHash, phone: '+963944123456', ...o });
  const admin = await mk({ fullName: 'مدير النظام', email: 'admin@aqarcom.app', role: 'admin' });
  const seeker = await mk({ fullName: 'سامر الباحث', email: 'user@aqarcom.app', role: 'user', city: 'دمشق' });
  const landlord = await mk({ fullName: 'ليلى المالكة', email: 'owner@aqarcom.app', role: 'property_owner', phone: '+963933111222', whatsapp: '+963933111222' });
  const projectOwner = await mk({ fullName: 'خالد صاحب المشروع', email: 'project@aqarcom.app', role: 'project_owner' });
  const contractors = await Promise.all(
    [
      ['شركة الشام للمقاولات', 'contractor1@aqarcom.app'],
      ['مؤسسة البناء الحديث', 'contractor2@aqarcom.app'],
      ['المكتب الهندسي المتحد', 'contractor3@aqarcom.app'],
    ].map(([companyName, email]) => mk({ fullName: companyName, companyName, email, role: 'contractor', verificationStatus: 'verified' }))
  );
  // new accounts waiting for approval from the admin dashboard
  const pendingContractor = await mk({ fullName: 'شركة جديدة للمقاولات', companyName: 'شركة جديدة للمقاولات', email: 'contractor4@aqarcom.app', role: 'contractor', verificationStatus: 'pending', status: 'pending', city: 'حلب' });
  await mk({ fullName: 'رامي العقاري', email: 'pending.owner@aqarcom.app', role: 'property_owner', status: 'pending', city: 'حمص' });
  await mk({ fullName: 'نور صاحبة المشروع', email: 'pending.project@aqarcom.app', role: 'project_owner', status: 'pending', city: 'دمشق' });
  await mk({ fullName: 'حساب مرفوض', email: 'rejected@aqarcom.app', role: 'property_owner', status: 'rejected', statusReview: { by: admin._id, at: new Date(), reason: 'رقم الهاتف غير صحيح', action: 'reject' } });
  const { storageKey } = await fileStore.saveEncrypted(fileStore.SUBDIRS.verification, PDF);
  await models.VerificationRequest.create({
    contractor: pendingContractor._id,
    documents: [{ docType: 'engineers_syndicate', originalName: 'شهادة-النقابة.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length, storageKey }],
  });

  const props = [
    ['شقة مفروشة في المالكي', 'apartment', 'rent', 450, 140, 3, 'دمشق', 'المالكي', 33.5205, 36.2803],
    ['شقة للبيع في المزة فيلات غربية', 'apartment', 'sale', 85000, 160, 4, 'دمشق', 'المزة', 33.5021, 36.2496],
    ['محل تجاري في الحمرا', 'shop', 'rent', 600, 45, 0, 'دمشق', 'الحمرا', 33.5137, 36.2936],
    ['أرض للاستثمار في يعفور', 'land', 'investment', 250000, 3000, 0, 'ريف دمشق', 'يعفور', 33.5281, 36.1196],
    ['فيلا في الصبورة', 'villa', 'sale', 320000, 420, 6, 'ريف دمشق', 'الصبورة', 33.5199, 36.1755],
    ['شقة في الفرقان', 'apartment', 'sale', 42000, 120, 3, 'حلب', 'الفرقان', 36.2195, 37.1224],
    ['مكتب في شارع الدبلان', 'office', 'rent', 300, 90, 2, 'حمص', 'الدبلان', 34.7270, 36.7120],
    ['بيت عربي في باب توما', 'house', 'sale', 150000, 250, 5, 'دمشق', 'باب توما', 33.5140, 36.3169],
  ];
  for (const [title, propertyType, purpose, price, area, rooms, city, district, lat, lng] of props) {
    await models.Property.create({
      owner: landlord._id,
      title,
      description: `${title} — إعلان تجريبي لعرض منصة عقاركم.`,
      propertyType,
      purpose,
      price,
      currency: 'USD',
      area,
      rooms,
      bathrooms: rooms ? Math.max(1, Math.floor(rooms / 2)) : 0,
      city,
      district,
      location: { type: 'Point', coordinates: [lng, lat] },
    });
  }
  const firstProp = await models.Property.findOne({ title: /المالكي/ });
  await models.Favorite.create({ user: seeker._id, property: firstProp._id });

  // Open tender with 4 bids
  const t1 = await tenderSvc.create(projectOwner, {
    title: 'إكساء بناء سكني من 4 طوابق في المزة',
    description: 'إكساء كامل (تمديدات، بلاط، دهان، نجارة) لبناء من 4 طوابق بمساحة 800 م².',
    tenderType: 'finishing',
    city: 'دمشق',
    latitude: 33.5021,
    longitude: 36.2496,
    priceWeight: 60,
    durationWeight: 40,
    deadline: new Date(Date.now() + 3 * 86400000).toISOString(),
  });
  await tenderSvc.addDocument(t1._id, projectOwner, { buffer: PDF, originalName: 'دفتر-الشروط-v1.pdf' });
  await tenderSvc.publish(t1._id, projectOwner);
  const offers = [
    [100000, 120],
    [80000, 150],
    [120000, 90],
  ];
  for (let i = 0; i < contractors.length; i++) {
    await bidSvc.submit(t1._id, contractors[i], { totalPrice: offers[i][0], durationDays: offers[i][1], notes: 'عرض تجريبي' });
  }

  // Tender closing in 2 minutes — watch the scheduler close it and produce the shortlist live
  const t2 = await tenderSvc.create(projectOwner, {
    title: 'عمار بناء تجاري في حمص (عرض حيّ للإغلاق الآلي)',
    tenderType: 'construction',
    city: 'حمص',
    priceWeight: 50,
    durationWeight: 50,
    deadline: new Date(Date.now() + 2 * 60000).toISOString(),
  });
  await tenderSvc.addDocument(t2._id, projectOwner, { buffer: PDF, originalName: 'دفتر-شروط-حمص.pdf' });
  await tenderSvc.publish(t2._id, projectOwner);
  await bidSvc.submit(t2._id, contractors[0], { totalPrice: 500000, durationDays: 300 });
  await bidSvc.submit(t2._id, contractors[1], { totalPrice: 450000, durationDays: 360 });

  // Draft tender
  await tenderSvc.create(projectOwner, {
    title: 'مشاركة على أرض في يعفور (مسودة)',
    tenderType: 'partnership',
    city: 'ريف دمشق',
    priceWeight: 70,
    durationWeight: 30,
    deadline: new Date(Date.now() + 10 * 86400000).toISOString(),
  });

  console.log('\n✔ Seed complete. Demo accounts (password: %s):', PASSWORD);
  console.table([
    { role: 'admin', email: admin.email },
    { role: 'user', email: seeker.email },
    { role: 'property_owner', email: landlord.email },
    { role: 'project_owner', email: projectOwner.email },
    { role: 'contractor (verified)', email: 'contractor1..3@aqarcom.app' },
    { role: 'contractor (pending approval)', email: pendingContractor.email },
    { role: 'pending accounts', email: 'pending.owner@ / pending.project@aqarcom.app' },
  ]);
  await disconnectDB();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
