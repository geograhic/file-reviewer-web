# 闀挎湡缁存姢鎵嬪唽

杩欎釜杞欢鐨勯暱鏈熺ǔ瀹氭€ч噸鐐逛笉鏄€滄案杩滀笉鏀逛唬鐮佲€濓紝鑰屾槸璁╂暟鎹€佽縼绉昏矾寰勩€佹祴璇曞拰鏋勫缓鏂瑰紡濮嬬粓娓呮銆?

## 缁存姢鍘熷垯

- 鏁版嵁浼樺厛锛氬涔犺褰曚繚瀛樺湪 SQLite锛屽崌绾у墠鑷姩澶囦唤銆?
- 閰嶇疆闆嗕腑锛氶粯璁ゅ彧鏈変竴涓富鏁版嵁鐩綍锛岃缃€佹暟鎹簱銆佸浠姐€佹彃浠堕兘鍦ㄩ噷闈€?
- 璺緞杩佺Щ绋冲仴锛氫富鏁版嵁鐩綍杩佺Щ鍒扮┖鐩綍鏃剁洿鎺ヤ娇鐢紱杩佺Щ鍒板凡鏈夋櫘閫氱洰褰曟椂鑷姩鍒涘缓 `LiFileReviewer2` 瀛愮洰褰曪紝淇濇姢鐢ㄦ埛鍘熸湁鏂囦欢銆?
- 闀胯矾寰勫吋瀹癸細鍐呴儴鏂囦欢璇诲啓銆佹暟鎹簱銆佸鍑恒€佸浠姐€佺瑪璁颁娇鐢?Windows 闀胯矾寰勯€傞厤锛屽噺灏戞繁灞傜洰褰曞拰闀挎枃浠跺悕瀵艰嚧鐨勫け璐ャ€?
- 绗旇寮€鏀撅細绗旇淇濆瓨涓虹湡瀹?Markdown 鏂囦欢锛岄粯璁ゅ湪 `notes\`锛屽彲杩佺Щ鍒扮敤鎴疯嚜瀹氫箟璺緞锛屾敮鎸佹壒閲忓鍑哄拰鍒犻櫎銆?
- 瀵煎嚭鏄庣‘锛欳SV銆丣SON銆佽縼绉诲寘銆佹墜鍔ㄥ浠姐€佸垎浜寘銆佺瑪璁板鍑恒€佸鍏ュ墠澶囦唤閮戒細鍏堣鐢ㄦ埛閫夋嫨淇濆瓨浣嶇疆锛沗exports\` 鍙綔涓洪粯璁よ捣鐐广€?- 鍙縼绉伙細璁剧疆椤垫敮鎸?JSON 瀵煎嚭鍜屽畬鏁磋縼绉诲寘瀵煎嚭/瀵煎叆锛涘鍏ュ悗浼氫慨姝ｇ瑪璁拌矾寰勫埌褰撳墠鐢佃剳銆?
- 鍙獙璇侊細姣忔鏀瑰姩鍚庤繍琛屾祴璇曘€佷綋妫€銆佹簮鐮佹湇鍔″啋鐑熸祴璇曘€佹墦鍖呯増鍐掔儫娴嬭瘯銆?
- 鍙墿灞曪細璁剧疆椤垫湁鎻掍欢绠＄悊銆傛垚灏辩郴缁熷拰绀句氦璧勬枡宸茬粡浣滀负鍐呯疆鎻掍欢娉ㄥ唽锛屽彲鍚敤/鍏抽棴锛涘叧闂悗瀵瑰簲 UI 妯″潡浼氫粠甯冨眬涓Щ闄わ紝鍚敤鍚庡姩鎬佹寕杞斤紱`plugins\` 鐩綍缁х画鏀寔璇诲彇澶栭儴娓呭崟锛岄粯璁や笉鎵ц鎻掍欢浠ｇ爜锛岄伩鍏嶇牬鍧忕ǔ瀹氭€с€?
## 甯哥敤鍛戒护

```powershell
python -m py_compile app.py tests\test_core.py
python -m unittest discover -s tests -v
python app.py --health-check
python app.py --backup
python app.py --export-portable
python app.py --export-profile
python app.py --no-window --port 8897
```

鎵撳寘锛?

```powershell
python -m PyInstaller --noconfirm --clean --onefile --windowed --name "鏅鸿兘鏂囦欢澶嶄範绯荤粺2.14.0_WebUI" --add-data "web;web" --hidden-import webview.platforms.winforms app.py
```

## 鍗囩骇鏁版嵁搴撹鍒?

1. 淇敼 `SCHEMA_VERSION`銆?
2. 鍦?`init_db()` 涓坊鍔犲悜鍓嶅吋瀹硅縼绉汇€?
3. 淇濈暀鑷姩澶囦唤閫昏緫銆?
4. 鏂板鎴栧彉鏇存暟鎹粨鏋勫悗琛ユ祴璇曘€?
5. 杩愯 `python app.py --health-check`銆?

## 杩佺Щ鍑哄彛

- `exports\review_portable_*.json`锛氬紑鏀?JSON 鏁版嵁锛屼究浜庢湭鏉ヨ縼绉诲埌鍏朵粬绋嬪簭銆?- `exports\review_items_*.csv`锛氳〃鏍兼暟鎹紝渚夸簬鐢ㄦ埛鑷鍒嗘瀽銆?- `exports\LiFileReviewer2_profile_*.zip`锛氬畬鏁磋縼绉诲寘锛屽寘鍚厤缃€佹暟鎹簱澶囦唤銆佸浠界洰褰曘€佹彃浠剁洰褰曘€佺瑪璁扮洰褰曘€?- 绗旇瀵煎嚭锛氬鍒堕€変腑鐨?Markdown 绗旇鍒扮敤鎴烽€夋嫨鐨勫鍑虹洰褰曘€?
2.9.0 璧凤紝浠ヤ笂鍙槸榛樿鏂囦欢鍚嶇ず渚嬨€傛闈㈢晫闈細鍦ㄦ瘡娆″鍑烘垨澶囦唤鍓嶅脊鍑轰繚瀛樹綅缃紝鐢ㄦ埛鍙互鏀惧埌浠绘剰鍙啓璺緞銆?
## 鎴愬氨鎻掍欢

鎴愬氨绯荤粺鏈韩鐢卞唴缃彃浠?`achievement_core` 鎺у埗锛屽彲鍦ㄨ缃〉鎻掍欢绠＄悊閲屽叧闂€傚叧闂悗鎬昏椤垫垚灏遍潰鏉夸細浠庡竷灞€涓Щ闄わ紝鑰屼笉鏄樉绀衡€滃凡鍏抽棴鈥濆崰浣嶃€傛彃浠剁洰褰曚笅鍙垱寤哄瓙鐩綍锛屼緥濡?`plugins\achievement_pack\plugin.json`锛?
2.12.0 璧凤紝璁剧疆椤垫彃浠剁鐞嗗彲浠ュ鍏ユ彃浠?zip 鍖呫€佸鍏ユ彃浠舵枃浠跺す銆佹墦寮€鎻掍欢鐩綍銆傚鍏ユ椂浼氭牎楠?`plugin.json`锛屽鍒跺埌涓绘暟鎹洰褰曠殑 `plugins\` 涓嬶紝骞剁敱閰嶇疆鏂囦欢缁熶竴鎺у埗鍚敤/鍏抽棴銆?
```json
{
  "id": "achievement_pack",
  "name": "Achievement Pack",
  "version": "1.0.0",
  "enabled": true,
  "achievements": [
    {
      "id": "review_5000",
      "title": "澶嶄範 5000 娆?,
      "description": "绱瀹屾垚 5000 娆″涔?,
      "metric": "reviews",
      "target": 5000,
      "points": 1200,
      "tier": "legend"
    }
  ]
}
```

鍙敤 metric 鍖呮嫭 `items`銆乣single_files`銆乣custom_decks`銆乣tagged_items`銆乣reviews`銆乣notes`銆乣done_items`銆乣streak`锛屼互鍙婃椿鍔ㄤ簨浠?`event:export_csv`銆乣event:export_json`銆乣event:export_profile`銆乣event:backup_database`銆乣event:export_share`銆乣event:export_notes`銆乣event:create_deck`銆乣event:create_note`銆乣event:add_item`銆乣event:study_seconds`銆?
## 绀句氦鎻掍欢

鍐呯疆鎻掍欢 `social_profile` 淇濆瓨鏈湴绀句氦璧勬枡锛氭樉绀哄悕绉般€佽处鍙?ID銆佺畝浠嬨€佷富椤点€佽仈绯讳俊鎭€佺粺璁″垎浜亸濂姐€佹垚灏卞垎浜亸濂姐€佹湭鏉ュソ鍙嬪彂鐜板紑鍏炽€傚叧闂悗璁剧疆椤电ぞ浜よ祫鏂欒〃鍗曚細浠庡竷灞€涓Щ闄わ紝鍚敤鍚庡啀鏄剧ず骞舵仮澶嶇紪杈戝叆鍙ｃ€?
褰撳墠鐗堟湰鍙繚瀛樻湰鍦拌祫鏂欏苟鐢熸垚 `LiFileReviewerSocialCard` JSON锛屼笉杩炴帴澶栭儴缃戠粶銆佷笉涓婁紶鏁版嵁銆傚悗缁ソ鍙嬨€佸姩鎬併€佸崗浣滃涔犮€佸叕寮€鎴愬氨澧欑瓑鍔熻兘鍙互鍩轰簬杩欎釜鎻掍欢缁х画鎵╁睍銆?
鍗充娇寰堝骞村悗 Python銆乄indows 鎴栨祻瑙堝櫒鐢熸€佸彉鍖栵紝鍙 JSON 鍜?SQLite 浠嶈兘璇诲彇锛屾暟鎹氨鑳界户缁縼绉汇€?

## 寤鸿鑺傚

- 姣忔湀锛氫綋妫€涓€娆★紝澶囦唤鏁版嵁搴撲竴娆°€?
- 姣忔澶ч噺鎵弿鍓嶏細鍏堝浠芥暟鎹簱銆?
- 姣忔鍗囩骇鍓嶏細瀵煎嚭杩佺Щ鍖咃紝骞朵繚鐣欐棫 exe銆?
- 姣忔鍙戠粰鍒汉鍓嶏細杩愯娴嬭瘯鍜屾墦鍖呯増鍋ュ悍妫€鏌ャ€?

