/* Kiwi Order · libellés fixes de la page client. Aucune traduction n'est
 * demandée au modèle depuis le téléphone du client. Une clé absente retombe
 * sur l'anglais défini dans kiwi-order.html. */
(function () {
  'use strict';
  const KEYS = [
    'greet_line1','greet_sub_em','mode_sub','mode_table_label','mode_takeout_label','closed_now','closed_order','table_ask_em','table_hint','btn_continue',
    'coming_soon','badge_takeout','badge_table','tab_top','tab_all','tab_pastry','tab_drink','service_call','service_bill','cart_pill',
    'custom_from','custom_note_label','custom_note_optional','custom_price','btn_add','cart_title','cart_empty','cart_total','send_table','send_takeout',
    'success_title_a','success_recap','success_cta','prep_ready_in','ready_title_a','ready_title_em','ready_cta','bill_title','bill_total','cashier_total',
  ];
  const ROWS = {
    es: [
      'Hola,','pide desde tu mesa','Elige cómo quieres empezar.','Estoy en una mesa','Para llevar','Cerrado ahora','Pedidos no disponibles','número de mesa','El número está grabado en la mesa','Continuar',
      'Menú disponible próximamente','Para llevar','Mesa','Popular','Todo','Bollería','Bebidas','Llamar al camarero','Cuenta','Ver mi pedido',
      'Desde','Petición especial','opcional','Precio','Añadir','Tu pedido','La cesta está vacía, elige algo del menú.','Total','Enviar a cocina','Hacer pedido',
      'Pedido enviado','Tu pedido','Añadir a mi pedido','Listo en','Tu pedido está','listo.','Recoger en el mostrador','Tu cuenta','Total a pagar','Total',
    ],
    de: [
      'Hallo,','bestelle von deinem Tisch','Wähle, wie du beginnen möchtest.','Ich sitze am Tisch','Zum Mitnehmen','Jetzt geschlossen','Bestellung nicht möglich','Tischnummer','Die Nummer ist in den Tisch eingraviert','Weiter',
      'Menü bald verfügbar','Zum Mitnehmen','Tisch','Beliebt','Alle','Gebäck','Getränke','Service rufen','Rechnung','Meine Bestellung',
      'Ab','Sonderwunsch','optional','Preis','Hinzufügen','Deine Bestellung','Der Warenkorb ist leer. Wähle etwas aus dem Menü.','Gesamt','An Küche senden','Bestellen',
      'Bestellung gesendet','Deine Bestellung','Mehr bestellen','Fertig in','Deine Bestellung ist','fertig.','Am Tresen abholen','Deine Rechnung','Zu zahlen','Gesamt',
    ],
    it: [
      'Ciao,','ordina dal tuo tavolo','Scegli come vuoi iniziare.','Sono al tavolo','Da asporto','Chiuso ora','Ordini non disponibili','numero del tavolo','Il numero è inciso sul tavolo','Continua',
      'Menu presto disponibile','Da asporto','Tavolo','Più scelti','Tutto','Pasticceria','Bevande','Chiama il cameriere','Conto','Vedi il mio ordine',
      'Da','Richiesta speciale','facoltativo','Prezzo','Aggiungi','Il tuo ordine','Il carrello è vuoto, scegli qualcosa dal menu.','Totale','Invia in cucina','Ordina',
      'Ordine inviato','Il tuo ordine','Aggiungi al mio ordine','Pronto tra','Il tuo ordine è','pronto.','Ritira al banco','Il tuo conto','Totale da pagare','Totale',
    ],
    pt: [
      'Olá,','peça a partir da sua mesa','Escolha como quer começar.','Estou numa mesa','Para levar','Fechado agora','Pedidos indisponíveis','número da mesa','O número está gravado na mesa','Continuar',
      'Menu disponível em breve','Para levar','Mesa','Destaques','Tudo','Pastelaria','Bebidas','Chamar o empregado','Conta','Ver o meu pedido',
      'A partir de','Pedido especial','opcional','Preço','Adicionar','O seu pedido','O carrinho está vazio, escolha algo do menu.','Total','Enviar para a cozinha','Fazer pedido',
      'Pedido enviado','O seu pedido','Adicionar ao pedido','Pronto em','O seu pedido está','pronto.','Levantar ao balcão','A sua conta','Total a pagar','Total',
    ],
    nl: [
      'Hallo,','bestel vanaf je tafel','Kies hoe je wilt beginnen.','Ik zit aan tafel','Afhalen','Nu gesloten','Bestellen niet beschikbaar','tafelnummer','Het nummer staat in de tafel gegraveerd','Doorgaan',
      'Menu binnenkort beschikbaar','Afhalen','Tafel','Populair','Alles','Gebak','Dranken','Roep de bediening','Rekening','Bekijk mijn bestelling',
      'Vanaf','Speciale wens','optioneel','Prijs','Toevoegen','Jouw bestelling','Je winkelmand is leeg, kies iets van het menu.','Totaal','Naar keuken sturen','Bestellen',
      'Bestelling verzonden','Jouw bestelling','Meer bestellen','Klaar over','Je bestelling is','klaar.','Afhalen bij de balie','Jouw rekening','Te betalen','Totaal',
    ],
    ru: [
      'Здравствуйте,','закажите прямо со стола','Выберите способ заказа.','Я за столиком','С собой','Сейчас закрыто','Заказ недоступен','номер столика','Номер выгравирован на столе','Продолжить',
      'Меню скоро появится','С собой','Столик','Популярное','Всё','Выпечка','Напитки','Позвать официанта','Счёт','Мой заказ',
      'От','Особое пожелание','необязательно','Цена','Добавить','Ваш заказ','Корзина пуста, выберите что-нибудь из меню.','Итого','Отправить на кухню','Заказать',
      'Заказ отправлен','Ваш заказ','Добавить к заказу','Будет готово через','Ваш заказ','готов.','Забрать у стойки','Ваш счёт','К оплате','Итого',
    ],
    'zh-Hans': [
      '您好，','在餐桌上直接点餐','请选择点餐方式。','堂食','外带','当前已打烊','暂时无法点餐','桌号','桌号刻在桌面上','继续',
      '菜单即将上线','外带','桌号','热门','全部','甜点','饮品','呼叫服务员','结账','查看我的订单',
      '起价','特殊要求','可选','价格','添加','您的订单','购物车为空，请从菜单中选择。','总计','发送到厨房','提交订单',
      '订单已发送','您的订单','继续加菜','预计完成','您的订单已','准备好。','到柜台取餐','您的账单','应付总额','总计',
    ],
    'zh-Hant': [
      '您好，','在餐桌上直接點餐','請選擇點餐方式。','內用','外帶','目前已打烊','暫時無法點餐','桌號','桌號刻在桌面上','繼續',
      '菜單即將上線','外帶','桌號','熱門','全部','甜點','飲品','呼叫服務員','結帳','查看我的訂單',
      '起價','特殊要求','選填','價格','加入','您的訂單','購物車是空的，請從菜單中選擇。','總計','送到廚房','送出訂單',
      '訂單已送出','您的訂單','繼續加點','預計完成','您的訂單已','準備好。','到櫃台取餐','您的帳單','應付總額','總計',
    ],
    ja: [
      'こんにちは、','テーブルからご注文ください','注文方法を選んでください。','店内で食べる','テイクアウト','現在閉店中です','注文できません','テーブル番号','番号はテーブルに刻印されています','続ける',
      'メニューは近日公開予定です','テイクアウト','テーブル','人気','すべて','ペストリー','ドリンク','スタッフを呼ぶ','お会計','注文を見る',
      '価格','特別なリクエスト','任意','価格','追加','ご注文','カートは空です。メニューからお選びください。','合計','キッチンへ送る','注文する',
      '注文を送信しました','ご注文','追加注文','準備まで','ご注文が','できました。','カウンターで受け取る','お会計','お支払い合計','合計',
    ],
    ko: [
      '안녕하세요,','테이블에서 주문하세요','주문 방법을 선택하세요.','매장에서 먹기','포장','현재 영업 종료','주문할 수 없음','테이블 번호','번호는 테이블에 새겨져 있습니다','계속',
      '메뉴 준비 중','포장','테이블','인기','전체','디저트','음료','직원 호출','계산서','내 주문 보기',
      '시작 가격','특별 요청','선택 사항','가격','추가','주문 내역','장바구니가 비어 있습니다. 메뉴에서 골라 주세요.','합계','주방으로 보내기','주문하기',
      '주문 전송 완료','주문 내역','더 주문하기','준비 시간','주문이','준비되었습니다.','카운터에서 받기','계산서','결제 금액','합계',
    ],
    tr: [
      'Merhaba,','masanızdan sipariş verin','Nasıl başlamak istediğinizi seçin.','Masadayım','Paket servis','Şu anda kapalı','Sipariş verilemiyor','masa numarası','Numara masanın üzerine işlenmiştir','Devam',
      'Menü yakında hazır','Paket servis','Masa','Popüler','Tümü','Hamur işleri','İçecekler','Garson çağır','Hesap','Siparişimi gör',
      'Başlangıç','Özel istek','isteğe bağlı','Fiyat','Ekle','Siparişiniz','Sepet boş, menüden bir şey seçin.','Toplam','Mutfağa gönder','Sipariş ver',
      'Sipariş gönderildi','Siparişiniz','Siparişe ekle','Hazır olma süresi','Siparişiniz','hazır.','Tezgahtan al','Hesabınız','Ödenecek toplam','Toplam',
    ],
    he: [
      'שלום,','הזמינו מהשולחן','בחרו איך להתחיל.','אני בשולחן','לקחת','סגור עכשיו','לא ניתן להזמין','מספר שולחן','המספר חרוט על השולחן','המשך',
      'התפריט יעלה בקרוב','לקחת','שולחן','פופולרי','הכול','מאפים','משקאות','קריאה למלצר','חשבון','הצגת ההזמנה',
      'החל מ־','בקשה מיוחדת','לא חובה','מחיר','הוספה','ההזמנה שלך','העגלה ריקה, בחרו משהו מהתפריט.','סה״כ','שליחה למטבח','ביצוע הזמנה',
      'ההזמנה נשלחה','ההזמנה שלך','הוספה להזמנה','מוכן בעוד','ההזמנה שלך','מוכנה.','איסוף מהדלפק','החשבון שלך','סה״כ לתשלום','סה״כ',
    ],
    pl: [
      'Dzień dobry,','zamów ze swojego stolika','Wybierz sposób zamawiania.','Jestem przy stoliku','Na wynos','Teraz zamknięte','Zamawianie niedostępne','numer stolika','Numer jest wygrawerowany na stoliku','Dalej',
      'Menu wkrótce dostępne','Na wynos','Stolik','Popularne','Wszystko','Wypieki','Napoje','Zawołaj kelnera','Rachunek','Zobacz zamówienie',
      'Od','Specjalna prośba','opcjonalnie','Cena','Dodaj','Twoje zamówienie','Koszyk jest pusty, wybierz coś z menu.','Razem','Wyślij do kuchni','Zamów',
      'Zamówienie wysłane','Twoje zamówienie','Dodaj do zamówienia','Gotowe za','Twoje zamówienie jest','gotowe.','Odbierz przy ladzie','Twój rachunek','Do zapłaty','Razem',
    ],
    sv: [
      'Hej,','beställ från ditt bord','Välj hur du vill börja.','Jag sitter vid ett bord','Ta med','Stängt just nu','Beställning ej tillgänglig','bordsnummer','Numret är ingraverat i bordet','Fortsätt',
      'Menyn kommer snart','Ta med','Bord','Populärt','Alla','Bakverk','Drycker','Kalla på personal','Nota','Visa min beställning',
      'Från','Särskilt önskemål','valfritt','Pris','Lägg till','Din beställning','Korgen är tom, välj något från menyn.','Totalt','Skicka till köket','Beställ',
      'Beställning skickad','Din beställning','Lägg till i beställningen','Klar om','Din beställning är','klar.','Hämta vid disken','Din nota','Att betala','Totalt',
    ],
    no: [
      'Hei,','bestill fra bordet ditt','Velg hvordan du vil starte.','Jeg sitter ved et bord','Ta med','Stengt nå','Bestilling utilgjengelig','bordnummer','Nummeret er gravert i bordet','Fortsett',
      'Meny kommer snart','Ta med','Bord','Populært','Alle','Bakverk','Drikke','Tilkall betjening','Regning','Se bestillingen min',
      'Fra','Spesielt ønske','valgfritt','Pris','Legg til','Bestillingen din','Kurven er tom, velg noe fra menyen.','Totalt','Send til kjøkkenet','Bestill',
      'Bestilling sendt','Bestillingen din','Legg til i bestillingen','Klar om','Bestillingen din er','klar.','Hent ved disken','Regningen din','Å betale','Totalt',
    ],
    da: [
      'Hej,','bestil fra dit bord','Vælg, hvordan du vil starte.','Jeg sidder ved et bord','Takeaway','Lukket nu','Bestilling ikke mulig','bordnummer','Nummeret er indgraveret i bordet','Fortsæt',
      'Menuen kommer snart','Takeaway','Bord','Populært','Alle','Bagværk','Drikkevarer','Tilkald tjener','Regning','Se min bestilling',
      'Fra','Særligt ønske','valgfrit','Pris','Tilføj','Din bestilling','Kurven er tom, vælg noget fra menuen.','I alt','Send til køkkenet','Bestil',
      'Bestilling sendt','Din bestilling','Tilføj til bestillingen','Klar om','Din bestilling er','klar.','Hent ved disken','Din regning','Til betaling','I alt',
    ],
    hi: [
      'नमस्ते,','अपनी मेज़ से ऑर्डर करें','शुरू करने का तरीका चुनें।','मैं मेज़ पर हूँ','पैक करा लें','अभी बंद है','ऑर्डर उपलब्ध नहीं','मेज़ नंबर','नंबर मेज़ पर लिखा है','आगे बढ़ें',
      'मेन्यू जल्द उपलब्ध होगा','पैक करा लें','मेज़','लोकप्रिय','सभी','पेस्ट्री','पेय','वेटर बुलाएँ','बिल','मेरा ऑर्डर देखें',
      'से शुरू','विशेष अनुरोध','वैकल्पिक','कीमत','जोड़ें','आपका ऑर्डर','कार्ट खाली है, मेन्यू से कुछ चुनें।','कुल','रसोई में भेजें','ऑर्डर करें',
      'ऑर्डर भेजा गया','आपका ऑर्डर','ऑर्डर में जोड़ें','इतनी देर में तैयार','आपका ऑर्डर','तैयार है।','काउंटर से लें','आपका बिल','कुल भुगतान','कुल',
    ],
    id: [
      'Halo,','pesan dari meja Anda','Pilih cara memulai.','Saya di meja','Bawa pulang','Sedang tutup','Pemesanan tidak tersedia','nomor meja','Nomor terukir di meja','Lanjutkan',
      'Menu segera tersedia','Bawa pulang','Meja','Populer','Semua','Pastri','Minuman','Panggil pelayan','Tagihan','Lihat pesanan saya',
      'Mulai dari','Permintaan khusus','opsional','Harga','Tambah','Pesanan Anda','Keranjang kosong, pilih sesuatu dari menu.','Total','Kirim ke dapur','Pesan',
      'Pesanan terkirim','Pesanan Anda','Tambah pesanan','Siap dalam','Pesanan Anda','sudah siap.','Ambil di konter','Tagihan Anda','Total bayar','Total',
    ],
    el: [
      'Γεια σας,','παραγγείλετε από το τραπέζι σας','Επιλέξτε πώς θέλετε να ξεκινήσετε.','Είμαι σε τραπέζι','Σε πακέτο','Κλειστά τώρα','Η παραγγελία δεν είναι διαθέσιμη','αριθμός τραπεζιού','Ο αριθμός είναι χαραγμένος στο τραπέζι','Συνέχεια',
      'Το μενού θα είναι σύντομα διαθέσιμο','Σε πακέτο','Τραπέζι','Δημοφιλή','Όλα','Γλυκά','Ποτά','Καλέστε σερβιτόρο','Λογαριασμός','Δείτε την παραγγελία μου',
      'Από','Ειδικό αίτημα','προαιρετικό','Τιμή','Προσθήκη','Η παραγγελία σας','Το καλάθι είναι άδειο, επιλέξτε κάτι από το μενού.','Σύνολο','Αποστολή στην κουζίνα','Παραγγελία',
      'Η παραγγελία στάλθηκε','Η παραγγελία σας','Προσθήκη στην παραγγελία','Έτοιμο σε','Η παραγγελία σας είναι','έτοιμη.','Παραλαβή από τον πάγκο','Ο λογαριασμός σας','Σύνολο πληρωμής','Σύνολο',
    ],
    uk: [
      'Вітаємо,','замовляйте зі свого столика','Оберіть спосіб замовлення.','Я за столиком','Із собою','Зараз зачинено','Замовлення недоступне','номер столика','Номер вигравірувано на столику','Продовжити',
      'Меню незабаром з’явиться','Із собою','Столик','Популярне','Усе','Випічка','Напої','Покликати офіціанта','Рахунок','Моє замовлення',
      'Від','Особливе побажання','необов’язково','Ціна','Додати','Ваше замовлення','Кошик порожній, виберіть щось із меню.','Разом','Надіслати на кухню','Замовити',
      'Замовлення надіслано','Ваше замовлення','Додати до замовлення','Буде готово за','Ваше замовлення','готове.','Забрати біля стійки','Ваш рахунок','До сплати','Разом',
    ],
  };
  const out = {};
  Object.keys(ROWS).forEach((lang) => {
    out[lang] = {};
    KEYS.forEach((key, i) => { if (ROWS[lang][i] != null) out[lang][key] = ROWS[lang][i]; });
  });
  window.KiwiOrderUiLangs = Object.freeze(out);
})();
