import XCTest
final class Ticket151: XCTestCase {
 let app=XCUIApplication(bundleIdentifier:"com.kiwios.pro.qa0151")
 let base="http://127.0.0.1:8775"
 let output="/Users/zaka/.codex/worktrees/qa-six-fixes/kiwi/docs/audits/evidence/2026-10-01-ticket-0151/native-final"
 func request(_ endpoint:String,_ data:[String:Any]?=nil)throws->[String:Any]? {
  var req=URLRequest(url:URL(string:base+endpoint)!);if let data=data {req.httpMethod="POST";req.httpBody=try JSONSerialization.data(withJSONObject:data);req.setValue("application/json",forHTTPHeaderField:"Content-Type")}
  let lock=DispatchSemaphore(value:0);var bytes:Data?;var error:Error?
  URLSession.shared.dataTask(with:req){d,_,e in bytes=d;error=e;lock.signal()}.resume();_ = lock.wait(timeout:.now()+15)
  if let error=error{throw error};guard let bytes=bytes else {throw NSError(domain:"observer",code:1)}
  return (try JSONSerialization.jsonObject(with:bytes,options:[.fragmentsAllowed])) as? [String:Any]
 }
 func js(_ code:String)throws->Any? {
  let id=try request("/command",["code":code])!["id"] as! Int
  for _ in 0..<400 {if let r=try request("/get?id=\(id)"){if let e=r["error"] as? String{XCTFail(e);throw NSError(domain:e,code:2)};return r["value"]};Thread.sleep(forTimeInterval:0.05)}
  throw NSError(domain:"observer timed out",code:3)
 }
 func object(_ code:String)throws->[String:Any]{return try js(code) as? [String:Any] ?? [:]}
 func q(_ s:String)throws->String {let a=String(data:try JSONSerialization.data(withJSONObject:[s]),encoding:.utf8)!;return String(a.dropFirst().dropLast())}
 @discardableResult func tap(_ selector:String)throws->Bool {
  let s=try q(selector)
  _=try js("(()=>{const e=document.querySelector(\(s));if(!e)return false;e.scrollIntoView({block:'center',inline:'center',behavior:'instant'});return true})()")
  Thread.sleep(forTimeInterval:0.8)
  let r=try object("(()=>{const e=document.querySelector(\(s));if(!e)return {};const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {x:r.x,y:r.y,w:r.width,h:r.height,hit:e===h||e.contains(h)}})()")
  guard let x=r["x"] as? Double, let y=r["y"] as? Double, let w=r["w"] as? Double, let h=r["h"] as? Double,r["hit"] as? Bool==true,w>0,h>0,y>=0,y+h<=app.frame.height else{return false}
  app.coordinate(withNormalizedOffset:CGVector(dx:0,dy:0)).withOffset(CGVector(dx:x+w/2,dy:y+h/2)).tap();Thread.sleep(forTimeInterval:0.6);return true
 }
 func save(_ name:String)throws {
  try FileManager.default.createDirectory(atPath:output,withIntermediateDirectories:true)
  try app.screenshot().pngRepresentation.write(to:URL(fileURLWithPath:output+"/"+name+".png"))
  let value=try object("__auditSnapshot()")
  try JSONSerialization.data(withJSONObject:value,options:[.prettyPrinted,.sortedKeys]).write(to:URL(fileURLWithPath:output+"/"+name+".json"))
  XCTAssertEqual(value["overflow"] as? Int,0)
  XCTAssertTrue((value["errors"] as? [String] ?? []).isEmpty)
 }
 func go(_ route:String)throws {
  XCTAssertTrue(try tap(".kw-hamburger"),"hamburger blocked");XCTAssertTrue(try tap(".sidebar a[data-nav='"+route+"']"),"sidebar route blocked: "+route);Thread.sleep(forTimeInterval:0.7)
 }
 func testInteractions()throws {
  continueAfterFailure=false;app.launch();Thread.sleep(forTimeInterval:4)
  let boot=try object("({manual:!!document.querySelector('#manual-mode')?.getClientRects().length})")
  if boot["manual"] as? Bool==true {
   let manual=app.buttons["kiwi-action-manual"];XCTAssertTrue(manual.waitForExistence(timeout:5));manual.tap();Thread.sleep(forTimeInterval:1)
   let dashboard=app.buttons.matching(NSPredicate(format:"label CONTAINS %@ OR label CONTAINS %@ OR label CONTAINS %@", "Dashboard", "Tableau de bord", "لوحة التحكم")).firstMatch
   XCTAssertTrue(dashboard.waitForExistence(timeout:5));dashboard.tap();Thread.sleep(forTimeInterval:3)
  }
  let first=try object("({explore:!!document.querySelector('.kob-root [data-explore]')?.getClientRects().length})")
  if first["explore"] as? Bool==true {XCTAssertTrue(try tap(".kob-root [data-explore]"))}
  let entry=try object("({skip:!!document.querySelector('[data-kiwi-skip]')?.getClientRects().length})")
  if entry["skip"] as? Bool==true {XCTAssertTrue(try tap("[data-kiwi-skip]"))};Thread.sleep(forTimeInterval:2)
  print("AFTER ENTRY",try object("({skip:document.querySelector('[data-kiwi-skip]')?.getBoundingClientRect().toJSON(),html:document.documentElement.className,body:document.body.className})"));try save("debug-entry")
  _=try js("KiwiI18n.setLang('en');KiwiDashTheme.set('light');KiwiI18n.setTheme('light');true")
  try save("debug-themed-entry");try go("menu");XCTAssertTrue(try tap("[data-action='rmw-cat-filter'][data-cat='all']"))
  XCTAssertTrue(try tap("[data-action='rmw-section-actions']"));XCTAssertTrue(try tap("[data-catalog-action='reorder']"));Thread.sleep(forTimeInterval:0.5)
  let before=try js("KiwiMenuStore.categories().map(c=>c.id)") as! [String]
  let from=try object("(()=>{const r=document.querySelector('.catalog-reorder-row button').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
  let to=try object("(()=>{const r=document.querySelector('.catalog-reorder-row:nth-child(2)').getBoundingClientRect();return {x:r.x+20,y:r.y+r.height/2}})()")
  let origin=app.coordinate(withNormalizedOffset:CGVector(dx:0,dy:0))
  origin.withOffset(CGVector(dx:from["x"] as! Double,dy:from["y"] as! Double)).press(forDuration:0.15,thenDragTo:origin.withOffset(CGVector(dx:to["x"] as! Double,dy:to["y"] as! Double)))
  Thread.sleep(forTimeInterval:0.6)
  let after=try js("KiwiMenuStore.categories().map(c=>c.id)") as! [String];XCTAssertEqual(after[1],before[0]);
  XCTAssertTrue(try js("document.querySelector('.catalog-reorder-row:nth-child(2) select').getBoundingClientRect().width>=76&&document.querySelector('.catalog-reorder-row:nth-child(2) select').getBoundingClientRect().height>=44") as? Bool==true);try save("touch-drag-reorder")
  XCTAssertTrue(try tap(".catalog-reorder-row:nth-child(2) select"));try save("touch-position-picker");print("POSITION PICKER AX",app.debugDescription)
  let wheel=app.pickerWheels.firstMatch
  if wheel.waitForExistence(timeout:2) {wheel.adjust(toPickerWheelValue:"1");let done=app.buttons["Done"];if done.exists {done.tap()}} else {let option=app.buttons["1"];XCTAssertTrue(option.waitForExistence(timeout:2));option.tap()}
  Thread.sleep(forTimeInterval:0.8);XCTAssertEqual((try js("KiwiMenuStore.categories().map(c=>c.id)") as! [String])[0],before[0]);try save("touch-position-selected")
  XCTAssertTrue(try tap("[data-catalog-done]"));Thread.sleep(forTimeInterval:0.5)
  XCTAssertTrue(try tap(".catalog-item-edit"));XCTAssertTrue(try js("!!document.querySelector('.kiwi-modal [data-name]')") as? Bool==true);try save("touch-item-editor")
  XCTAssertTrue(try tap(".kiwi-backdrop .kiwi-modal-close"));Thread.sleep(forTimeInterval:0.5)
  XCTAssertTrue(try tap(".catalog-item-footer .catalog-more"));try save("touch-item-actions")
  XCTAssertTrue(try tap("[data-catalog-action='availability']"));Thread.sleep(forTimeInterval:0.5)
  XCTAssertTrue(try js("!document.documentElement.classList.contains('kiwi-locked')&&!window.__kiwiScrollLocks") as? Bool==true)
 }
 func testCatalog()throws {
  continueAfterFailure=false;app.launch();Thread.sleep(forTimeInterval:4)
  let boot=try object("({manual:!!document.querySelector('#manual-mode')?.getClientRects().length})")
  if boot["manual"] as? Bool==true {let manual=app.buttons["Choose a role without setup"];XCTAssertTrue(manual.waitForExistence(timeout:5));manual.tap();Thread.sleep(forTimeInterval:1)
   let dashboard=app.buttons.matching(NSPredicate(format:"label CONTAINS %@", "Dashboard")).firstMatch;XCTAssertTrue(dashboard.waitForExistence(timeout:5));dashboard.tap();Thread.sleep(forTimeInterval:3)}
  let first=try object("({explore:!!document.querySelector('.kob-root [data-explore]')?.getClientRects().length,skip:!!document.querySelector('[data-kiwi-skip]')?.getClientRects().length})")
  if first["explore"] as? Bool==true {XCTAssertTrue(try tap(".kob-root [data-explore]"))}
  let entry=try object("({skip:!!document.querySelector('[data-kiwi-skip]')?.getClientRects().length})")
  if entry["skip"] as? Bool==true {XCTAssertTrue(try tap("[data-kiwi-skip]"))}
  Thread.sleep(forTimeInterval:2)
  _=try js("(()=>{const s=KiwiMenuStore;s.addCategory('TEST KIWI Main');s.addCategory('TEST KIWI Empty');const c=s.categories().find(c=>c.name==='TEST KIWI Main');s.addSubcategory(c.id,'TEST KIWI Tajines');const sub=s.categories().find(x=>x.id===c.id).sub[0].id;for(let i=0;i<60;i++)s.addItem({name:i===0?'TEST KIWI Traditional tajine with seasonal vegetables and preserved lemon':'TEST KIWI Item '+i,price:85+i%20,catId:c.id,subId:sub,avail:i%7!==0});return true})()")
  for lang in ["en","fr","ar"] {for theme in ["light","dark"]{
   _=try js("KiwiI18n.setLang('"+lang+"');KiwiDashTheme.set('"+theme+"');KiwiI18n.setTheme('"+theme+"');true");Thread.sleep(forTimeInterval:0.4)
   try go("menu");try save(lang+"-"+theme+"-menu")
   XCTAssertTrue(try tap("[data-action='rmw-section-actions']"));try save(lang+"-"+theme+"-section-sheet")
   XCTAssertTrue(try tap(".kiwi-backdrop .kiwi-modal-close"));Thread.sleep(forTimeInterval:0.4)
   try go("stock");try save(lang+"-"+theme+"-overview")
   XCTAssertTrue(try tap("[data-action='stock-tab'][data-tab='items']"));try save(lang+"-"+theme+"-items")
   XCTAssertTrue(try tap("[data-action='stock-view'][data-view='cards']"));try save(lang+"-"+theme+"-cards")
   XCTAssertTrue(try tap("[data-action='stock-tab'][data-tab='suppliers']"));try save(lang+"-"+theme+"-suppliers")
   XCTAssertTrue(try tap(".st-supplier-cards [data-action='stock-supplier-detail']"));try save(lang+"-"+theme+"-supplier-detail")
   XCTAssertTrue(try tap(".kiwi-backdrop .kiwi-modal-close"));Thread.sleep(forTimeInterval:0.4)
   XCTAssertTrue(try tap("[data-action='stock-tab'][data-tab='orders']"));try save(lang+"-"+theme+"-orders")
  }}
 }
}
