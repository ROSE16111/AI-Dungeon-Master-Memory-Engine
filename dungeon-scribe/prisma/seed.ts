// prisma/seed.ts
import { PrismaClient, ResourceCategory } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

// 兼容 ESM 的 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取图片并转 Base64（可选）
function encodeImageToBase64(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1);
  return `data:image/${ext};base64,${buf.toString('base64')}`;
}

async function main() {
  // --- 示例图片（如果不存在就跳过） ---
  const imgPath = path.join(__dirname, '../public/summary.png');
  const imageBase64 = fs.existsSync(imgPath) ? encodeImageToBase64(imgPath) : undefined;

  // ========= Campaign 1 =========
  const campaign1 = await prisma.campaign.create({
    data: { id: 'cmp1', title: 'The Shadow Forest', startDate: new Date('2025-08-01T10:00:00Z') },
  });

  await prisma.role.createMany({
    data: [
      { id: 'r1', name: 'Thalion the Ranger', level: 5, campaignId: campaign1.id },
      { id: 'r2', name: 'Elaria the Sorceress', level: 7, campaignId: campaign1.id },
    ],
  });

  await prisma.allTxt.createMany({
    data: [
      { id: 'txt1', content: 'The party ventured deep into the woods...', campaignId: campaign1.id, createdAt: new Date('2025-08-05T09:00:00Z') },
      { id: 'txt2', content: 'They discovered an ancient ruin covered in vines...', campaignId: campaign1.id, createdAt: new Date('2025-08-06T10:30:00Z') },
    ],
  });

  await prisma.summary.createMany({
    data: [
      { id: 's1', type: 'session', content: 'The team enters the Shadow Forest...', campaignId: campaign1.id, createdAt: new Date('2025-08-05T10:00:00Z'), imageBase64 },
      { id: 's2', type: 'character', content: 'Thalion scouted ahead...', roleName: 'Thalion the Ranger', campaignId: campaign1.id, createdAt: new Date('2025-08-05T11:00:00Z'), imageBase64 },
    ],
  });

  // ========= Campaign 2 =========
  const campaign2 = await prisma.campaign.create({
    data: { id: 'cmp2', title: 'Desert of Mirages', startDate: new Date('2025-07-15T08:00:00Z') },
  });

  await prisma.role.createMany({
    data: [
      { id: 'r3', name: 'Zahir the Nomad', level: 4, campaignId: campaign2.id },
      { id: 'r4', name: 'Layla the Illusionist', level: 6, campaignId: campaign2.id },
    ],
  });

  await prisma.allTxt.create({
    data: { id: 'txt3', content: 'They crossed a sandstorm...', campaignId: campaign2.id, createdAt: new Date('2025-07-18T09:00:00Z') },
  });

  await prisma.summary.createMany({
    data: [
      { id: 's4', type: 'session', content: 'First night in the desert...', campaignId: campaign2.id, createdAt: new Date('2025-07-18T10:00:00Z'), imageBase64 },
      { id: 's5', type: 'character', content: 'Layla cast a mirage...', roleName: 'Layla the Illusionist', campaignId: campaign2.id, createdAt: new Date('2025-07-18T11:00:00Z'), imageBase64 },
    ],
  });

  // ========= Campaign 3 =========
  const campaign3 = await prisma.campaign.create({
    data: { id: 'cmp3', title: 'Citadel Under Siege', startDate: new Date('2025-06-01T14:00:00Z') },
  });

  await prisma.role.create({
    data: { id: 'r5', name: 'General Marcus', level: 10, campaignId: campaign3.id },
  });

  await prisma.allTxt.create({
    data: { id: 'txt4', content: 'The walls shook as the siege engines fired...', campaignId: campaign3.id, createdAt: new Date('2025-06-02T10:00:00Z') },
  });

  await prisma.summary.create({
    data: { id: 's6', type: 'session', content: 'Day 1 of the siege...', campaignId: campaign3.id, createdAt: new Date('2025-06-02T12:00:00Z'), imageBase64 },
  });

  // ========= Resources（关键：全部在 main() 里） =========
  await prisma.resource.createMany({
    data: [
      {
        id: 'res1',
        title: 'Northern Valley',
        category: ResourceCategory.Map,
        fileUrl: '/uploads/northern-valley.pdf',
        previewUrl: '/historypp.png',
        campaignId: campaign1.id,
      },
      {
        id: 'res2',
        title: 'Baldur\'s Gate',
        category: ResourceCategory.Background,
        fileUrl: '/uploads/bg.txt',
        previewUrl: '/historypp.png',
        campaignId: campaign1.id,
      },
      {
        id: 'res3',
        title: 'Moonblade',
        category: ResourceCategory.Others,
        fileUrl: '/uploads/moonblade.txt',
        previewUrl: '/historypp.png',
        campaignId: campaign2.id,
      },
    ],
    //skipDuplicates: true,
  });

  console.log('✅ Seed completed.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
