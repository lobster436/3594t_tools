// 実行中チェック
if (typeof _3594t_tools_running === "undefined") {
  _3594t_tools_running = false;
}
if (_3594t_tools_running) {
  log("3594t_tools is running.");
  return;
}

const debug = false;
log("3594t_tools start.");

if (typeof require === "undefined") {
  const element = document.createElement('script');
  element.src = 'https://cdn.jsdelivr.net/npm/airtable@0.11.1/build/airtable.browser.min.js';
  document.body.appendChild(element);
}
  while (typeof require === "undefined") {
  await sleep(1000);
}

const secrets = await decode(secret)
const secretKeyName = Object.keys(secrets)[0]
const baseName = Object.keys(secrets)[1]
const Airtable = require('airtable');
const base = new Airtable({apiKey: secrets[secretKeyName]}).base(secrets[baseName]);

async function main() {
  if (_3594t_tools_running) {
    return;
  }
  _3594t_tools_running = true;
  let result = 0;
  const hideLoading = showLoading();
  try {
    // 対戦履歴
    if (location.href.startsWith("https://3594t.net/members/history/daily")) {
      result = await importBattle();
    }
    // データリスト
    if (location.href.startsWith("https://3594t.net/datalist/")) {
      result = await importWarlord();
    }
  } finally {
    _3594t_tools_running = false;
    hideLoading();
  }
  return result;
}

function showLoading() {
  const img = document.createElement('img');
  img.src = "https://www.benricho.org/loading_images/img-size/loading-l-17.gif";
  img.style = "position: fixed; top: calc(50% - 40px); left: calc(50% - 40px); height: 80px; width: 80px; z-index: 100;";
  document.body.appendChild(img);

  return () => {
    document.body.removeChild(img);
  };
}

// 武将データを取り込む
async function importWarlord() {
  log("Start importWarlord()");
  
  // Webページから情報収集
  const datalist = findElements(document, "//*[@class='datalist_block clickable']");
  const warlordList = datalist.map(data => {
    const warlordId = data.getAttribute("data-code");
    const country = findElement(data, ".//*[@class='datalist_block_state']").textContent;
    const warlordName = findElement(data, ".//*[@class='datalist_block_card']//img").alt;
    const cost = findElement(data, ".//*[@class='datalist_block_cost']").textContent;
    const unit = findElement(data, ".//*[@class='datalist_block_unit']//img").alt;
    const power = findElement(data, ".//*[@class='datalist_block_power']").textContent;
    const intelligence = findElement(data, ".//*[@class='datalist_block_intelligence']").textContent;
    const control = findElement(data, ".//*[@class='datalist_block_control']").textContent;
    const skill = findElements(data, ".//*[@class='datalist_block_skill_block']//div").map(e => e.textContent).join(" ");
    const tactics = findElement(data, ".//*[contains(@class,'datalist_block_tactics')]").textContent;
    const morale = findElement(data, ".//*[@class='datalist_block_morale']").textContent.replace(/[【】]/g,'');

    return {
      fields: {
        "武将ID": warlordId,
        "勢力": country,
        "武将名": warlordName,
        "コスト": parseFloat(cost),
        "兵種": unit,
        "武力": parseInt(power),
        "知力": parseInt(intelligence),
        "征圧力": parseInt(control),
        "特技": skill,
        "計略名": tactics,
        "必要士気": parseInt(morale),
      }
    }
  });

  // 既存データを取得
  const selectFields = ["武将ID", "勢力", "武将名", "コスト", "兵種", "武力", "知力", "征圧力", "特技", "計略名", "必要士気"];
  const records = await getRecords("武将", "武将ID", warlordList.map(e => e.fields["武将ID"]), selectFields);
  const recordsIdList = Object.values(records).map(e => e["武将ID"]);

  // 存在しない場合は登録
  const newList = warlordList.filter(e => !recordsIdList.includes(e.fields["武将ID"]));
  await createRecords("武将", newList);
  
  // 変更がある場合は更新
  const warlordRecords = {};
  Object.entries(records).forEach(([id, fields]) => {
    warlordRecords[fields["武将ID"]] = {id, fields};
  });
  const changeList = warlordList.filter(warlord => {
    const record = warlordRecords[warlord.fields["武将ID"]];
    if (record) {
      warlord.id = record.id;
      return selectFields.some(field => warlord.fields[field] !== record.fields[field]);
    } else {
      return false;
    }
  });
  await updateRecords("武将", changeList);

  log("End importWarlord()")

  return newList.length + changeList.length;
}

// 対戦データを取り込む
async function importBattle() {
  log("Start importBattle()");
  
  // Webページから情報収集
  const date = findElement(document, "//*[@id='header_r']//h2").textContent.replace(/^[^(]+|[()]/g,'');
  const blockBattleList = findElements(document, "//*[contains(@class,'block_battle_list')]");

  let battleList = [];
  let cardMap = {};
  let warlordIdList = [];
  for (let blockBattle of blockBattleList) {
    const battleInfo = await collectBattleInfo(blockBattle, date);
    log("battleInfo", battleInfo);

    battleList = battleList.concat(battleInfo.battleList);
    cardMap = Object.assign(cardMap, battleInfo.cardMap);
    warlordIdList = warlordIdList.concat(battleInfo.warlordIdList);
  }
  warlordIdList = Array.from(new Set(warlordIdList));
  log("battleList", battleList);
  log("cardMap", cardMap);
  log("warlordIdList", warlordIdList);

  const warlordRecords = await getRecords("武将", "武将ID", warlordIdList);
  const warlordIdMap = {};
  Object.entries(warlordRecords).forEach(([key,value]) => {
    warlordIdMap[value["武将ID"]] = key;
  });
  log("warlordIdMap", warlordIdMap);

  // 使用カードの既存データを取得
  const cardIdList = Object.keys(cardMap);
  const cardRecords = await getRecords("使用カード", "使用カードID", cardIdList);
  const cardRecordIdList = Object.values(cardRecords).map(e => e["使用カードID"]);
  
  // 使用カードが存在しない場合は登録
  const newCardList = Object.values(cardMap).filter(e => !cardRecordIdList.includes(e.fields["使用カードID"]));
  newCardList.forEach(e => {
    log("card", e);
    const warlordId = e.fields["武将"];
    const warlordRecordId = warlordIdMap[warlordId];
    if (warlordRecordId) {
      e.fields["武将"] = [warlordRecordId];
    } else {
      error("新規カードがあります。データのアップデートをお待ちください。");
    }
  });
  let cardIdMap = {};
  const createdRecords = await createRecords("使用カード", newCardList);
  Object.entries(Object.assign(cardRecords, createdRecords)).forEach(([key,value]) => {
    cardIdMap[value["使用カードID"]] = key;
  });
  log("cardIdMap", cardIdMap);

  // 対戦の既存データを取得
  const battleRecords = await getRecords("対戦", "対戦ID", battleList.map(e => e.fields["対戦ID"]));
  const battleRecordIdList = Object.values(battleRecords).map(e => e["対戦ID"]);

  // 対戦が存在しない場合は登録
  const newBattleList = battleList.filter(e => !battleRecordIdList.includes(e.fields["対戦ID"]));
  newBattleList.forEach(e => {
    log("battle", e);
    const cardIdList = e.fields["使用カード"];
    e.fields["使用カード"] = cardIdList.map(cardId =>{
      const cardRecordId = cardIdMap[cardId];
      if (!cardRecordId) {
        log("使用カードが登録されてません。", cardId);
      }
      return cardRecordId;
    })
    .filter(e => !!e);
  });
  await createRecords("対戦", newBattleList);

  log("End importBattle()");

  return newBattleList.length / 2;
}

async function collectBattleInfo(blockBattle, date) {
  log("collect battle info", date);
  const time = findElement(blockBattle, ".//*[contains(@class,'battle_list_time')]").textContent;
  const myname = findElement(blockBattle, ".//*[contains(@class,'battle_list_mydata')]//*[contains(@class,'battle_list_name')]//span").textContent;
  const myleague = findElement(blockBattle, ".//*[contains(@class,'battle_list_mydata')]//*[contains(@class,'battle_list_league')]//img").alt;
  const enemyname = findElement(blockBattle, ".//*[contains(@class,'battle_list_enemydata')]//*[contains(@class,'battle_list_name')]//span").textContent;
  const enemyleague = findElement(blockBattle, ".//*[contains(@class,'battle_list_enemydata')]//*[contains(@class,'battle_list_league')]//img").alt;
  const isWin = findElement(blockBattle, ".//*[contains(@class,'battle_list_result')]//img").src.endsWith('icon_1_s.png');

  await sleep(1000);
  const battleUrl = findElement(blockBattle, ".//a[contains(@class,'battle_list_base')]").href;
  const cardInfo = await collectBattleCardInfo(battleUrl);
  log("cardInfo", cardInfo);

  const datetime = new Date(Date.parse(`${date} ${time.replace(/翌/,"")}`));
  if (time.startsWith("翌")) {
    datetime.setDate(datetime.getDate() + 1);
  }

  const datetimeISO = datetime.toISOString();
  const datetimeString = datetime.toLocaleString().replace(/[ /:]/g,'');
  const dateString = datetime.toLocaleDateString().replace(/[/]/g,'');

  const cardMap = {};
  cardInfo.myWarlordIdList.forEach(warlordId => {
    const cardId = myleague + warlordId + dateString;
    cardMap[cardId] = {
      fields: {
        "使用カードID": cardId,
        "日付": date.replace(/\//g,"-"),
        "階級": myleague,
        "武将": warlordId,
        "対戦": [],
      }
    }
  });
  cardInfo.enemyWarlordIdList.map(warlordId => {
    const cardId = enemyleague + warlordId + dateString;
    cardMap[cardId] = {
      fields: {
        "使用カードID": cardId,
        "日付": date.replace(/\//g,"-"),
        "階級": enemyleague,
        "武将": warlordId,
        "対戦": [],
      }
    }
  });
  log("cardMap", cardMap);

  return {
    battleList: [
      {
        fields: {
          "対戦ID": myname + datetimeString,
          "対戦日時": datetimeISO,
          "階級": myleague,
          "勝敗": (isWin ? "勝利" : "敗北"),
          "プレイヤー": myname,
          "相手対戦ID": enemyname + datetimeString,
          "使用カード": cardInfo.myWarlordIdList.map(warlordId => myleague + warlordId + dateString),
        },
      },
      {
        fields: {
          "対戦ID": enemyname + datetimeString,
          "対戦日時": datetimeISO,
          "階級": enemyleague,
          "勝敗": (isWin ? "敗北" : "勝利"),
          "プレイヤー": enemyname,
          "相手対戦ID": myname + datetimeString,
          "使用カード": cardInfo.enemyWarlordIdList.map(warlordId => enemyleague + warlordId + dateString),
        },
      }
    ],
    cardMap: cardMap,
    warlordIdList: cardInfo.myWarlordIdList.concat(cardInfo.enemyWarlordIdList),
  };
}

function collectBattleCardInfo(battleUrl) {
  log("collect battle card info");
  return new Promise(resolve => {
    const request = new XMLHttpRequest();
    request.open("GET", battleUrl);
    request.responseType = "document";
    request.onload = function(event) {
      if (event.target.status !== 200) {
        log("detail取得失敗：" + event.target.status);
        resolve({});
        return;
      }

      const myWarlordIdList = findElements(event.target.responseXML, "//*[contains(@class,'frame_red')]//*[@class='data_deck_cardblock_popup']").map(e => e.outerHTML.split("'")[1]);
      const enemyWarlordIdList = findElements(event.target.responseXML, "//*[contains(@class,'frame_blue')]//*[@class='data_deck_cardblock_popup']").map(e => e.outerHTML.split("'")[1]);

      resolve({
        myWarlordIdList,
        enemyWarlordIdList,
      });
    }
    request.send();
  });
}

// テーブルのレコードを取得
function getRecords(table, fieldName, idList, selectFields) {
  log("get records", table);
  return new Promise(resolve => {
    const result = {};
    if (!selectFields) {
      selectFields = [fieldName]
    }

    base(table).select({
      fields: selectFields,
      filterByFormula: `OR(${idList.map(e => `{${fieldName}}='${e}'`).join(",")})`
    }).eachPage(function page(records, fetchNextPage) {
      records.forEach(function(record) {
          log("Retrieved", record);
          result[record.id] = record.fields;
        });
      fetchNextPage();
    }, function done(err) {
        if (err) {
          console.error(err);
        }
        log("getRecords", table, result);
        resolve(result);
      });
  });
}

// テーブルにレコードを登録
async function createRecords(table, data) {
  log("create records", table);
  const result = {};
  let count = 0;
  while (data.length > 0) {
    await sleep(200);

    const subdata = data.splice(0, 10);
    count += subdata.length;
    log(`${table} ${count}件 登録`)

    await new Promise(resolve => {
      base(table).create(subdata, (err, records) => {
        if (err) {
          console.error(err);
        } else {
          records.forEach(record => {
            log("Created", record);
            result[record.id] = record.fields;
          });
        }
        resolve();
      });
    });
  }
  return result;
}

// テーブルのレコードを更新
async function updateRecords(table, data) {
  log("update records", table);
  const result = {};
  let count = 0;
  while (data.length > 0) {
    await sleep(200);

    const subdata = data.splice(0, 10);
    count += subdata.length;
    log(`${table} ${count}件 更新`)

    await new Promise(resolve => {
      base(table).update(subdata, (err, records) => {
        if (err) {
          console.error(err);
        } else {
          records.forEach(record => {
            log("Updated", record);
            result[record.id] = record.fields;
          });
        }
        resolve();
      });
    });
  }
  return result;
}

// DOMの要素を検索
function findElement(parent, xpath) {
  return document.evaluate(xpath, parent, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue || {};
}

// DOMの要素を検索
function findElements(parent, xpath) {
  const result = document.evaluate(xpath, parent, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  const elements = [];
  for(let i = 0; i < result.snapshotLength; i++){
    elements.push(result.snapshotItem(i));
  }
  return elements;
}

// 処理をスリープ
function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

// エラー表示
function error(message) {
  alert(message);
  throw new Error(message);
}

// ログ
function log(...args) {
  if (debug) console.log(...args)
}

async function decode(encoded) {
  const secretInfo = JSON.parse(atob(encoded))
  return {
    secretKey: await decript(secretInfo.secretKey, secretInfo.password),
    base: await decript(secretInfo.base, secretInfo.password),
  }
}

async function decript(input, password) {
  const inputOrg = JSON.parse(atob(input))
  return new TextDecoder().decode(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(inputOrg.iv) },
    await crypto.subtle.importKey(
      'jwk',
      JSON.parse(atob(password)),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    ),
    toArrayBuffer(new Uint8Array(inputOrg.value))
  ))
}

function toArrayBuffer(buffer) {
  var ab = new ArrayBuffer(buffer.length);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return ab;
}

main()
  .then(() => {alert("登録しました。")})
  .catch(error => {throw error});
