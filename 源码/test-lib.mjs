/* 素材库改写测试：把页面复制一份（多开一个测试钩子），在浏览器里跑真实改写。 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = 'C:/Users/yuanbiluan/Documents/Codex/2026-10-11/ppt-ai-ai';
const SRC = `${ROOT}/outputs/HanLin采访-发给同事/HanLin采访-离线版.html`;

let html = readFileSync(SRC, 'utf8');
const marker = '  bind();\n  setAdminStatus(';
if (!html.includes(marker)) throw new Error('找不到脚本结尾锚点');
html = html.replace(marker, '  window.__fix = fixSentence;\n  window.__lib = libGroups;\n' + marker);
mkdirSync(`${ROOT}/work/tmp`, { recursive: true });
writeFileSync(`${ROOT}/work/tmp/hanlin-test.html`, html);

const CASES_BAD = [
  "I have many book.", "There are much trees.", "There is many water.", "It is a information.",
  "I have two apple.", "He has three tooth.", "My foots hurt.", "There are two childs.",
  "Many peoples like music.", "This is Tom father.", "He is a friend of Tom.",
  "I waited five minute.", "It is ten minute's walk.", "I like potatos.", "I have many photoes.",
  "There are some fishs.", "It is a news.", "I eat many rice.",
  "Me am a student.", "Help I, please.", "This is he book.", "The book is him.", "I love me.",
  "Each of them have a pen.", "Everyone are here.", "Both is good.", "Neither are wrong.",
  "I have some student in my class.", "There is anyone in room.", "Many of us book are new.",
  "Who's bag is this?", "It's tail is short.", "There are too much people.",
  "I go to the school every day.", "I play the basketball.", "I play piano.", "I waited a hour.",
  "He is an university student.", "I have the breakfast at 7.", "I get up early in morning.",
  "Sun is round.", "I go swimming once an week.", "I go to school by a bus.",
  "I go to school on the foot.", "What a fine weather!", "It is such a good news.",
  "I like the China.", "Turn a left at the corner.", "I have good time every day.",
  "I get up in Monday morning.", "It is hot at June.", "I get up in 8:00.",
  "I am good in English.", "I am interested on music.", "I am afraid at dogs.",
  "Thank you for help me.", "I arrive the station at 6.", "I wait you after school.",
  "I listen music every day.", "I am with a cold.", "I go to school by my bike.",
  "I am different with him.", "The glass is full with water.", "My parents are proud in me.",
  "I go to school from Monday and Friday.", "He runs quick.", "She is happily.",
  "He is more better than me.", "He is more taller than me.", "This one is gooder.",
  "The more, the good.", "He is tall of the two.", "She is very more beautiful.",
  "He is too much heavy.", "My older sister is a teacher.", "He is elder than me.",
  "I am interesting in music.", "He runs enough quickly.", "He is so a good boy.",
  "I drink few water.", "How a good film!", "He looks sadly.",
  "He get up at seven.", "I don't likes apples.", "Does he goes to school?",
  "I am like cats.", "He is swim every day.", "Look! He swim.", "I am go to school.",
  "They was at home.", "I see him yesterday.", "I will go yesterday.", "I am will go.",
  "He has go home.", "I finish my homework already.", "I have gone here before.",
  "I have lived here since two years.", "He dead for 2 years.",
  "There will have a party.", "There is going to have rain.", "He can sings well.",
  "I need do my homework.", "You needn't to go.",
  "I want play basketball.", "I hope you to come.", "Tell him go home.", "Ask him not go.",
  "He made me to cry.", "I saw him to play.", "I enjoy to read.", "I try do my best.",
  "I am busy do my homework.", "I spend an hour to read.", "I have fun to play football.",
  "He like play football.", "Neither you nor he are wrong.", "Tom with his friends are coming.",
  "A number of student is here.", "The news are good.", "Great changes have been taken place.",
  "It was happened yesterday.", "He is too young can't go.", "He is enough old to go.",
  "It is such difficult that I can't do it.", "I don't know where is he.",
  "Can you tell me what does he like?", "He said he will come.", "I think he isn't right.",
  "if or not", "He asked who was he.", "Could you tell me where is the shop?",
  "Do you know when will he leave?", "If it will rain tomorrow, we will stay home.",
  "When he will come, tell me.", "until he will arrive", "as soon as he will arrive",
  "How far is it take?", "I'm glad hear that.", "What's wrong to you?",
  "What's the matter of you?", "best wish", "Congratulations to your success.",
  "It's pleasure."
];
const CASES_OK = [
  "I am a student.", "He is good at English.", "I like playing basketball.",
  "We both like music.", "My partner is taller than me.", "I have been here for two years.",
  "She goes to school by bus.", "The sun is round.", "I have a lot of books.",
  "He runs quickly.", "I am interested in music.", "Thank you for helping me.",
  "I go to school every day.", "There is much water in the bottle.",
  "I don't think he is right.", "Could you tell me where the shop is?",
  "In the morning I read English.", "He is much taller than me.",
  "I have a piece of news for you.", "He plays the piano every day.",
  "There are many people in the park.", "I want to play football.", "Let him run.",
  "He made me cry.", "I enjoy reading.", "The news is good.",
  "I am busy doing my homework.", "He said he would come.", "When he comes, tell me.",
  "If it rains tomorrow, we will stay home.", "He is old enough to go to school.",
  "It is so difficult that I can't do it.", "I have two apples.", "I have many friends.",
  "She is happy.", "He can sing well.", "You needn't go.", "I need to do my homework.",
  "He looks sad.", "That's all right.", "I am not able to swim.", "He is able to swim.",
  "I take the bus to school.", "My family is big.", "She is much better now.",
  "There is a bird in the tree.", "I want to be a reporter.",
  "Both of us like English.", "Neither of them is late."
];

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('file:///' + `${ROOT}/work/tmp/hanlin-test.html`.replace(/\\/g, '/'));
await page.waitForTimeout(900);

const out = await page.evaluate((cases) => {
  if (typeof window.__fix !== 'function') return { error: 'hook missing' };
  var lib = window.__lib();
  var total = 0; lib.forEach(function(g){ total += g.items.length; });
  var shown = {};
  lib.forEach(function(g){ shown[g.cat] = g.items.length; });
  return {
    total: total,
    cats: shown,
    bad: cases.bad.map(function(s){ var r = window.__fix(s); return [s, r.corrected, r.changed]; }),
    ok: cases.ok.map(function(s){ var r = window.__fix(s); return [s, r.corrected, r.changed]; })
  };
}, { bad: CASES_BAD, ok: CASES_OK });

await browser.close();
if (out.error) throw new Error(out.error);
console.log('素材库总数：' + out.total);
console.log('分类：' + JSON.stringify(out.cats, null, 0));
const notFixed = out.bad.filter(r => !r[2]);
const badFixed = out.ok.filter(r => r[2]);
console.log('\n【应改但没改】' + notFixed.length + ' / ' + out.bad.length);
notFixed.forEach(r => console.log('   原句: ' + r[1]));
console.log('\n【不该改却改了】' + badFixed.length + ' / ' + out.ok.length);
badFixed.forEach(r => console.log('   原来: ' + r[0] + '   变成: ' + r[1]));
console.log('\n页面报错: ' + JSON.stringify(errs));
