// Focused browser regression for Bank Soal. Synthetic data; no database writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root=path.resolve('public'),output=path.resolve('qa-output');
await fs.mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  try{
    const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url));
    if(!file.startsWith(root+path.sep))throw Error('outside root');
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
    res.end(await fs.readFile(file));
  }catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM_PATH?{executablePath:process.env.QA_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
const results=[];
async function scenario(width){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();
  const requests=[],errors=[],questions={P1:[],P2:[]};let exams=[],failDashboard=false,hold=null;
  const core=()=>({exams,students:[],classes:[],classHistory:[],attendanceSessions:[],attendanceRecords:[],attempts:[],examRosters:{},refreshed:'2026-10-19 02:00:00'});
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  await page.route('**/api/**',async route=>{
    const b=route.request().postDataJSON(),pathname=new URL(route.request().url()).pathname;requests.push({pathname,...b});let data;
    if(pathname==='/api/login')data={token:'fixture-admin',...core()};
    else if(pathname==='/api/dashboard')data=failDashboard?{error:'Koneksi uji terputus.'}:core();
    else if(pathname==='/api/admin'){
      if(b.action==='dashboard')data=failDashboard?{error:'Koneksi uji terputus.'}:core();
      else if(b.action==='listQuestions'){
        if(hold&&b.examId==='P1'){const pending=hold;hold=null;await pending;}
        data={examId:b.examId,questions:questions[b.examId]};
      }else{
        assert.ok(['createQuestion','updateQuestion','deleteQuestion'].includes(b.action));
        if(exams.find(e=>e.id===b.examId).status==='BUKA')data={error:'Bank soal tidak dapat diubah saat ujian sedang BUKA.'};
        else{
          const q={id:b.questionId,text:b.text,a:b.a,b:b.b,c:b.c,d:b.d,key:b.key,weight:Number(b.weight),fileId:b.fileId||''};
          if(b.action==='createQuestion')questions[b.examId].push(q);
          else if(b.action==='updateQuestion')questions[b.examId]=questions[b.examId].map(old=>old.id===b.originalQuestionId?q:old);
          else questions[b.examId]=questions[b.examId].filter(old=>old.id!==b.questionId);
          data={examId:b.examId,questions:questions[b.examId]};
        }
      }
    }else if(pathname==='/api/learning'){
      data=b.action==='academic'?{ready:true,schedules:[],meetings:[],todayMeetings:[],teachers:[]}:{profile:{id:'ADMIN',name:'Admin Uji',role:'A'},photo:'',photoEnabled:true,canManageTeachers:true,teachers:[],classes:[],students:[],materials:[],tasks:[],submissions:[],attendance:[],sessions:[],uploadConfigured:true};
    }else throw Error('Unexpected request: '+pathname);
    await route.fulfill({status:data.error?400:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const visible=selector=>page.locator(selector).waitFor({state:'visible'});
  const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
  try{
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('#adminTab').click();await page.locator('#password').fill('fixture-password');await page.locator('#loginBtn').click();
    await visible('.p-hero');
    await page.locator('#adminBankNav').click();
    await page.locator('#questionBankMessage').filter({hasText:'Belum ada sesi ujian.'}).waitFor();
    assert.equal(await page.locator('#questionEditor').isVisible(),true);
    assert.equal(await page.locator('#questionForm').isVisible(),false);
    assert.equal(await page.locator('#alert').isVisible(),false);
    assert.equal(requests.filter(r=>r.action==='listQuestions').length,0);
    await noOverflow();await page.screenshot({path:path.join(output,'bank-empty-'+width+'.png'),fullPage:true});

    exams=['P1','P2'].map(id=>({id,title:'Ujian '+id,duration:60,start:'2026-10-19 08:00:00',end:'2026-10-19 10:00:00',status:'TUTUP',sessionPin:'',showScore:true}));
    await page.locator('#questionBankReload').click();await visible('#questionForm');
    assert.equal(await page.locator('#questionBankSession').inputValue(),'P1');
    assert.equal(await page.locator('#questionBankSession option').count(),2);
    await page.locator('#questionBankSession').selectOption('P2');
    await page.locator('#questionEditorExam').filter({hasText:'Ujian: P2'}).waitFor();
    assert.equal(await page.evaluate(()=>S.adminExamId),'','bank selection must not change monitoring selection');
    await page.locator('#questionId').fill('Q1');await page.locator('#questionTextInput').fill('Soal untuk P2');
    for(const key of ['A','B','C','D'])await page.locator('#question'+key).fill('Pilihan '+key);
    await page.locator('#questionSave').click();await page.locator('#questionRows').getByText('Soal untuk P2').waitFor();
    assert.equal(requests.find(r=>r.action==='createQuestion').examId,'P2');assert.equal(questions.P1.length,0);
    await page.locator('#questionRows').getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#questionTextInput').fill('Soal P2 diperbarui');await page.locator('#questionSave').click();
    await page.locator('#questionRows').getByText('Soal P2 diperbarui').waitFor();
    assert.equal(requests.find(r=>r.action==='updateQuestion').examId,'P2');
    await noOverflow();await page.screenshot({path:path.join(output,'bank-editor-'+width+'.png'),fullPage:true});

    // A slower previous response must never replace the newly selected bank.
    let release;hold=new Promise(resolve=>{release=resolve;});
    const slow=page.waitForResponse(r=>r.url().endsWith('/api/admin')&&r.request().postDataJSON()?.action==='listQuestions'&&r.request().postDataJSON()?.examId==='P1');
    await page.locator('#questionBankSession').selectOption('P1');await page.locator('#questionBankSession').selectOption('P2');
    await page.locator('#questionRows').getByText('Soal P2 diperbarui').waitFor();release();await slow;
    assert.equal(await page.locator('#questionEditorExam').textContent(),'Ujian: P2');
    await page.locator('#questionRows').getByRole('button',{name:'Hapus',exact:true}).click();
    await page.locator('#questionCount').filter({hasText:'0 soal'}).waitFor();assert.equal(requests.find(r=>r.action==='deleteQuestion').examId,'P2');

    failDashboard=true;await page.locator('#questionBankReload').click();await page.locator('#questionBankMessage').filter({hasText:'Koneksi uji terputus'}).waitFor();
    assert.equal(await page.locator('#questionForm').isVisible(),false);assert.equal(await page.locator('#questionBankReload').isEnabled(),true);
    failDashboard=false;await page.locator('#questionBankReload').click();await visible('#questionForm');
    await page.locator('#questionEditorClose').click();await visible('#adminMonitorPage');
    await page.locator('#adminBankNav').click();await visible('#questionForm');
    assert.equal(await page.locator('#questionBankSession').inputValue(),'P1');assert.equal(await page.locator('#alert').isVisible(),false);
    assert.deepEqual(errors,[]);results.push({width,status:'passed',checks:'empty state, refresh, session selection, CRUD routing, late-response isolation, network recovery, navigation, overflow'});
  }finally{await context.close();}
}
try{for(const width of [1440,390])await scenario(width);console.log(JSON.stringify(results,null,2));}
finally{await fs.writeFile(path.join(output,'question-bank-report.json'),JSON.stringify(results,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
