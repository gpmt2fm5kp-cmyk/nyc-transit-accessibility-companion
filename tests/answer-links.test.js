import test from 'node:test';
import assert from 'node:assert/strict';
import {answerParts} from '../public/answer-links.js';

test('official plain links and Markdown links become links without trailing punctuation',()=>{
  const url='https://www.mta.info/elevator-escalator-status';
  const parts=answerParts(`Check ${url}. Then [MTA status](${url}).`);
  assert.deepEqual(parts.filter(p=>p.href),[{text:url,href:url},{text:'MTA status',href:url}]);
  assert.equal(parts.map(p=>p.text).join(''),`Check ${url}. Then MTA status.`);
  assert.equal(answerParts(`(${url})`).find(p=>p.href).href,url);
});
test('unapproved hosts, deceptive authorities and unsafe schemes remain text',()=>{
  for(const text of ['https://www.mta.info.evil.example/status','https://www.mta.info@evil.example/','https://evil.example/','http://www.mta.info/','[click](javascript:alert(1))','https://name:secret@www.mta.info/','https://www.mta.info:8080/'])assert.ok(answerParts(text).every(p=>!p.href),text);
  assert.equal(answerParts('<img src=x onerror=alert(1)>').map(p=>p.text).join(''),'<img src=x onerror=alert(1)>');
});
test('multiple official source links and ordinary text are preserved',()=>{
  const text='Source https://data.ny.gov/Transportation/MTA-Subway-Stations/39hk-dx4f and https://new.mta.info/accessibility.';
  assert.equal(answerParts(text).filter(p=>p.href).length,2);
  assert.deepEqual(answerParts('No links here.'),[{text:'No links here.'}]);
});
