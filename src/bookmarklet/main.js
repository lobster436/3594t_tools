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
  const loading = showLoading();
  try {
    // 対戦履歴（日付選択）
    if (location.href === "https://3594t.net/members/history/") {
      result = await importBattleAllDays(loading);
    }
    // 対戦履歴
    if (location.href.startsWith("https://3594t.net/members/history/daily")) {
      result = await importBattle(loading);
      if (window !== parent) {
        result = false;
      }
    }
    // データリスト
    if (location.href.startsWith("https://3594t.net/datalist/")) {
      result = await importWarlord(loading);
    }
  } finally {
    _3594t_tools_running = false;
    loading();
  }
  return result;
}

function showLoading() {
  const div = document.createElement('div');
  div.style = "position: fixed; top: calc(50% - 50px); left: calc(50% - 90px); height: 100px; width: 180px; z-index: 100;";
  div.innerHTML = `
    <img style="height: 80px; width: 80px;" src="https://www.benricho.org/loading_images/img-size/loading-l-17.gif">
    <div><p id="loadingContent" style="margin: 0; background-color: blue; color: white; font-weight: 600;"></p></div>
  `;
  document.body.appendChild(div);

  return (content) => {
    if (content) {
      document.getElementById("loadingContent").innerText = content;
    } else {
      document.body.removeChild(div);
    }
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

async function importBattleAllDays(loading) {
  log("Start importBattleAllDays()");

  const dailyUrlList = findElements(document, "//td[contains(@class,'play_day')]//a").map(e => e.href);
  log("URL " + JSON.stringify(dailyUrlList));

  const now = Date.now();

  let progress = dailyUrlList.length;
  for (let url of dailyUrlList) {
    loading(`残り ${progress}日 処理中`);

    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style = [
      'width: 640px',
      'height: 100%',
      'position: fixed',
      'top: 0',
      'left: calc(100vw - 640px)',
      'z-index: 2',
    ].join(";");
    document.body.appendChild(iframe);
    await sleep(3000);

    const contentDocument = iframe.contentDocument || iframe.contentWindow.document;
    const script = contentDocument.createElement('script');
    script.src = 'https://behiro.github.io/3594t_tools/bookmarklet/main.js?_=' + now;
    contentDocument.body.appendChild(script);
  
    await sleep(3000);
    while (iframe.contentWindow._3594t_tools_running) {
      await sleep(1000);
    }
    document.body.removeChild(iframe);
    progress--;
  }

  return true;
}

// 対戦データを取り込む
async function importBattle(loading) {
  log("Start importBattle()");
  loading(`対戦データ　確認中`);
  
  // Webページから情報収集
  const date = findElement(document, "//*[@id='header_r']//h2").textContent.replace(/^[^(]+|[()]/g,'');

  // 最初のページへ移動
  const topPageLink = findElement(document, "//*[@class='btn_pager_top']//a");
  if (topPageLink.click) {
    topPageLink.click();
    await sleep(1000);
  }

  let blockBattleDataList = [];
  while (true) {
    // 対戦を取得
    const blockBattleList = findElements(document, "//*[contains(@class,'block_battle_list')]");
    const dataList = blockBattleList.map(blockBattle => {
      const time = findElement(blockBattle, ".//*[contains(@class,'battle_list_time')]").textContent;
      const datetime = new Date(Date.parse(`${date} ${time.replace(/翌/,"")}`));
      if (time.startsWith("翌")) {
        datetime.setDate(datetime.getDate() + 1);
      }
      const datetimeString = datetime.toLocaleString().replace(/[ /:]/g,'');

      const myname = findElement(blockBattle, ".//*[contains(@class,'battle_list_mydata')]//*[contains(@class,'battle_list_name')]//span").textContent;
      const enemyname = findElement(blockBattle, ".//*[contains(@class,'battle_list_enemydata')]//*[contains(@class,'battle_list_name')]//span").textContent;

      return {
        time,
        datetime,
        myid: myname + datetimeString,
        myname,
        myleague: findElement(blockBattle, ".//*[contains(@class,'battle_list_mydata')]//*[contains(@class,'battle_list_league')]//img").alt,
        enemyid: enemyname + datetimeString,
        enemyname,
        enemyleague: findElement(blockBattle, ".//*[contains(@class,'battle_list_enemydata')]//*[contains(@class,'battle_list_league')]//img").alt,
        isWin: findElement(blockBattle, ".//*[contains(@class,'battle_list_result')]//img").src.endsWith('icon_1_s.png'),
        battleUrl: findElement(blockBattle, ".//a[contains(@class,'battle_list_base')]").href,
      };
    });
    blockBattleDataList = [...blockBattleDataList, ...dataList];
  
    // 次のページがあれば移動
    const nextPageLink = findElement(document, "//*[@class='btn_pager_next']//a");
    if (!nextPageLink.click) {
      break;
    }
    nextPageLink.click();
    await sleep(1000);
  }

  // 対戦の既存データを取得
  let battleRecords = await getRecords("対戦", "対戦ID", blockBattleDataList.map(e => e.myid));
  let battleRecordIdList = Object.values(battleRecords).map(e => e["対戦ID"]);
  // 対戦が存在するものはスキップ
  blockBattleDataList = blockBattleDataList.filter(e => !battleRecordIdList.includes(e.myid));
  
  if (blockBattleDataList.length === 0) {
    log("End importBattle() imported already.");
    return 0;
  }
  loading(`対戦 ${blockBattleDataList.length}件 取得中`);

  let battleList = [];
  let cardMap = {};
  let warlordIdList = [];
  for (let blockBattleData of blockBattleDataList) {
    await sleep(3000);
    const battleInfo = await collectBattleInfo(date, blockBattleData);
    log("battleInfo", battleInfo);

    battleList = battleList.concat(battleInfo.battleList);
    cardMap = Object.assign(cardMap, battleInfo.cardMap);
    warlordIdList = warlordIdList.concat(battleInfo.warlordIdList);

    loading(`対戦 ${blockBattleDataList.length - battleList.length/2}件 取得中`);
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

  loading(`対戦 ${blockBattleDataList.length}件 登録中`);

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
  battleRecords = await getRecords("対戦", "対戦ID", battleList.map(e => e.fields["対戦ID"]));
  battleRecordIdList = Object.values(battleRecords).map(e => e["対戦ID"]);

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

async function collectBattleInfo(date, {time, datetime, myid, myname, myleague, enemyid, enemyname, enemyleague, isWin, battleUrl}) {
  log(`collect battle info ${date} ${time}`);

  const cardInfo = await collectBattleCardInfo(battleUrl);
  log("cardInfo", cardInfo);

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
          "対戦ID": myid,
          "対戦日時": datetime.toISOString(),
          "階級": myleague,
          "勝敗": (isWin ? "勝利" : "敗北"),
          "プレイヤー": myname,
          "相手対戦ID": enemyid,
          "使用カード": cardInfo.myWarlordIdList.map(warlordId => myleague + warlordId + dateString),
        },
      },
      {
        fields: {
          "対戦ID": enemyid,
          "対戦日時": datetime.toISOString(),
          "階級": enemyleague,
          "勝敗": (isWin ? "敗北" : "勝利"),
          "プレイヤー": enemyname,
          "相手対戦ID": myid,
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
  .then(result => {if (result) alert("登録しました。")})
  .catch(error => {throw error});
