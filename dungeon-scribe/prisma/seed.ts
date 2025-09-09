// prisma seed 
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; 
const prisma = new PrismaClient();

//  兼容 ESM 的 __dirname 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// read picture and change to Base64
function encodeImageToBase64(filePath: string): string {
  const imageBuffer = fs.readFileSync(filePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = path.extname(filePath).slice(1); // 'png', 'jpg'
  return `data:image/${ext};base64,${base64Image}`;
}

async function main() {
  const sessionImgPath = path.join(__dirname, '../public/summary.png');
  const characterImgPath = path.join(__dirname, '../public/summary.png');

  const sessionBase64 = encodeImageToBase64(sessionImgPath);
  const characterBase64 = encodeImageToBase64(characterImgPath);

  // === Campaign 1 ===
  const campaign1 = await prisma.campaign.create({
    data: {
      id: 'cmp1',
      title: 'The Shadow Forest',
      startDate: new Date('2025-08-01T10:00:00Z'),
    },
  });

  await prisma.role.createMany({
    data: [
      { id: 'r1', name: 'Thalion the Ranger', level: 5, campaignId: campaign1.id },
      { id: 'r2', name: 'Elaria the Sorceress', level: 7, campaignId: campaign1.id },
    ],
  });

  await prisma.allTxt.createMany({
    data: [
      {
        id: 'txt1',
        content: 'The party ventured deep into the woods...',
        campaignId: campaign1.id,
        createdAt: new Date('2025-08-05T09:00:00Z'),
      },
      {
        id: 'txt2',
        content: 'They discovered an ancient ruin covered in vines...',
        campaignId: campaign1.id,
        createdAt: new Date('2025-08-06T10:30:00Z'),
      },
    ],
  });

  await prisma.summary.createMany({
    data: [
      {
        id: 's1',
        type: 'session',
        content: 'The team enters the Shadow Forest and sets camp near the river.',
        campaignId: campaign1.id,
        createdAt: new Date('2025-08-05T10:00:00Z'),
        imageBase64: sessionBase64,
      },
      {
        id: 's2',
        type: 'character',
        content: 'Thalion scouted ahead and found a hidden trail.',
        roleName: 'Thalion the Ranger',
        campaignId: campaign1.id,
        createdAt: new Date('2025-08-05T11:00:00Z'),
        imageBase64: characterBase64,
      },
    ],
  });

  // === Campaign 2 ===
  const campaign2 = await prisma.campaign.create({
    data: {
      id: 'cmp2',
      title: 'Desert of Mirages',
      startDate: new Date('2025-07-15T08:00:00Z'),
    },
  });

  await prisma.role.createMany({
    data: [
      { id: 'r3', name: 'Zahir the Nomad', level: 4, campaignId: campaign2.id },
      { id: 'r4', name: 'Layla the Illusionist', level: 6, campaignId: campaign2.id },
    ],
  });

  await prisma.allTxt.create({
    data: {
      id: 'txt3',
      content: 'They crossed a sandstorm and arrived at a hidden oasis.',
      campaignId: campaign2.id,
      createdAt: new Date('2025-07-18T09:00:00Z'),
    },
  });

  await prisma.summary.createMany({
    data: [
      {
        id: 's4',
        type: 'session',
        content: 'First night in the desert, strange lights in the sky.',
        campaignId: campaign2.id,
        createdAt: new Date('2025-07-18T10:00:00Z'),
        imageBase64: sessionBase64, // reuse
      },
      {
        id: 's5',
        type: 'character',
        content: 'Layla cast a mirage to hide the camp.',
        roleName: 'Layla the Illusionist',
        campaignId: campaign2.id,
        createdAt: new Date('2025-07-18T11:00:00Z'),
        imageBase64: characterBase64,
      },
    ],
  });

  // === Campaign 3 ===
  const campaign3 = await prisma.campaign.create({
    data: {
      id: 'cmp3',
      title: 'Citadel Under Siege',
      startDate: new Date('2025-06-01T14:00:00Z'),
    },
  });

  await prisma.role.create({
    data: {
      id: 'r5',
      name: 'General Marcus',
      level: 10,
      campaignId: campaign3.id,
    },
  });

  await prisma.allTxt.create({
    data: {
      id: 'txt4',
      content: 'The walls shook as the siege engines fired relentlessly.',
      campaignId: campaign3.id,
      createdAt: new Date('2025-06-02T10:00:00Z'),
    },
  });

  await prisma.summary.create({
    data: {
      id: 's6',
      type: 'session',
      content: 'Day 1 of the siege: defenses barely held.',
      campaignId: campaign3.id,
      createdAt: new Date('2025-06-02T12:00:00Z'),
      imageBase64: sessionBase64,
    },
  });

  console.log('✅ Seed completed: 3 campaigns inserted.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
