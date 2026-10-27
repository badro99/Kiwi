
  function cuLang() {
    try {
      return (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || document.documentElement?.lang || 'fr';
    } catch (_) { return 'fr'; }
  }

  const cuNationalities = [
    { code: "MA", demonym: {"fr":"Marocaine","en":"Moroccan","ar":"مغربية"}, name: {"fr":"Maroc","en":"Morocco","ar":"المغرب"}, aliases: ["maroc","morocco","moroccan"] },
    { code: "FR", demonym: {"fr":"Française","en":"French","ar":"فرنسية"}, name: {"fr":"France","en":"France","ar":"فرنسا"}, aliases: ["france","french","francais"] },
    { code: "ES", demonym: {"fr":"Espagnole","en":"Spanish","ar":"إسبانية"}, name: {"fr":"Espagne","en":"Spain","ar":"إسبانيا"}, aliases: ["espagne","spain","spanish","espana"] },
    { code: "DZ", demonym: {"fr":"Algérienne","en":"Algerian","ar":"جزائرية"}, name: {"fr":"Algérie","en":"Algeria","ar":"الجزائر"}, aliases: ["algerie","algeria"] },
    { code: "TN", demonym: {"fr":"Tunisienne","en":"Tunisian","ar":"تونسية"}, name: {"fr":"Tunisie","en":"Tunisia","ar":"تونس"}, aliases: ["tunisie","tunisia"] },
    { code: "BE", demonym: {"fr":"Belge","en":"Belgian","ar":"بلجيكية"}, name: {"fr":"Belgique","en":"Belgium","ar":"بلجيكا"}, aliases: ["belgique","belgium"] },
    { code: "CH", demonym: {"fr":"Suisse","en":"Swiss","ar":"سويسرية"}, name: {"fr":"Suisse","en":"Switzerland","ar":"سويسرا"}, aliases: ["suisse","switzerland"] },
    { code: "DE", demonym: {"fr":"Allemande","en":"German","ar":"ألمانية"}, name: {"fr":"Allemagne","en":"Germany","ar":"ألمانيا"}, aliases: ["allemagne","germany","deutschland"] },
    { code: "IT", demonym: {"fr":"Italienne","en":"Italian","ar":"إيطالية"}, name: {"fr":"Italie","en":"Italy","ar":"إيطاليا"}, aliases: ["italie","italy","italia"] },
    { code: "GB", demonym: {"fr":"Britannique","en":"British","ar":"بريطانية"}, name: {"fr":"Royaume-Uni","en":"United Kingdom","ar":"المملكة المتحدة"}, aliases: ["royaume-uni","united kingdom","uk","great britain","england","angleterre","ecosse","scotland","wales","pays de galles"] },
    { code: "US", demonym: {"fr":"Américaine","en":"American","ar":"أمريكية"}, name: {"fr":"États-Unis","en":"United States","ar":"الولايات المتحدة"}, aliases: ["etats-unis","usa","united states","america"] },
    { code: "CA", demonym: {"fr":"Canadienne","en":"Canadian","ar":"كندية"}, name: {"fr":"Canada","en":"Canada","ar":"كندا"}, aliases: ["canada","canadian"] },
    { code: "PT", demonym: {"fr":"Portugaise","en":"Portuguese","ar":"برتغالية"}, name: {"fr":"Portugal","en":"Portugal","ar":"البرتغال"}, aliases: ["portugal"] },
    { code: "NL", demonym: {"fr":"Néerlandaise","en":"Dutch","ar":"هولندية"}, name: {"fr":"Pays-Bas","en":"Netherlands","ar":"هولندا"}, aliases: ["pays-bas","netherlands","hollande","holland"] },
    { code: "SN", demonym: {"fr":"Sénégalaise","en":"Senegalese","ar":"سنغالية"}, name: {"fr":"Sénégal","en":"Senegal","ar":"السنغال"}, aliases: ["senegal"] },
    { code: "CI", demonym: {"fr":"Ivoirienne","en":"Ivorian","ar":"إيفوارية"}, name: {"fr":"Côte d'Ivoire","en":"Ivory Coast","ar":"ساحل العاج"}, aliases: ["cote d'ivoire","ivory coast"] },
    { code: "AE", demonym: {"fr":"Émirienne","en":"Emirati","ar":"إماراتية"}, name: {"fr":"Émirats arabes unis","en":"United Arab Emirates","ar":"الإمارات"}, aliases: ["emirats","uae","united arab emirates","dubai"] },
    { code: "SA", demonym: {"fr":"Saoudienne","en":"Saudi","ar":"سعودية"}, name: {"fr":"Arabie saoudite","en":"Saudi Arabia","ar":"السعودية"}, aliases: ["arabie saoudite","saudi arabia","saudi"] },
    { code: "QA", demonym: {"fr":"Qatarienne","en":"Qatari","ar":"قطرية"}, name: {"fr":"Qatar","en":"Qatar","ar":"قطر"}, aliases: ["qatar"] },
    { code: "KW", demonym: {"fr":"Koweïtienne","en":"Kuwaiti","ar":"كويتية"}, name: {"fr":"Koweït","en":"Kuwait","ar":"الكويت"}, aliases: ["koweit","kuwait"] },
    { code: "EG", demonym: {"fr":"Égyptienne","en":"Egyptian","ar":"مصرية"}, name: {"fr":"Égypte","en":"Egypt","ar":"مصر"}, aliases: ["egypte","egypt"] },
    { code: "TR", demonym: {"fr":"Turque","en":"Turkish","ar":"تركية"}, name: {"fr":"Turquie","en":"Turkey","ar":"تركيا"}, aliases: ["turquie","turkey","turkiye"] },
    { code: "MR", demonym: {"fr":"Mauritanienne","en":"Mauritanian","ar":"موريتانية"}, name: {"fr":"Mauritanie","en":"Mauritania","ar":"موريتانيا"}, aliases: ["mauritanie","mauritania"] },
    { code: "ML", demonym: {"fr":"Malienne","en":"Malian","ar":"مالية"}, name: {"fr":"Mali","en":"Mali","ar":"مالي"}, aliases: ["mali"] },
    { code: "GN", demonym: {"fr":"Guinéenne","en":"Guinean","ar":"غينية"}, name: {"fr":"Guinée","en":"Guinea","ar":"غينيا"}, aliases: ["guinee","guinea"] },
    { code: "GA", demonym: {"fr":"Gabonaise","en":"Gabonese","ar":"غابونية"}, name: {"fr":"Gabon","en":"Gabon","ar":"الغابون"}, aliases: ["gabon"] },
    { code: "CM", demonym: {"fr":"Camerounaise","en":"Cameroonian","ar":"كاميرونية"}, name: {"fr":"Cameroun","en":"Cameroon","ar":"الكاميرون"}, aliases: ["cameroun","cameroon"] },
    { code: "CG", demonym: {"fr":"Congolaise","en":"Congolese","ar":"كونغولية"}, name: {"fr":"Congo","en":"Congo","ar":"الكونغو"}, aliases: ["congo"] },
    { code: "CD", demonym: {"fr":"Congolaise (RDC)","en":"Congolese (DRC)","ar":"كونغولية ديمقراطية"}, name: {"fr":"RD Congo","en":"DR Congo","ar":"جمهورية الكونغو الديمقراطية"}, aliases: ["rdc","drc"] },
    { code: "NG", demonym: {"fr":"Nigériane","en":"Nigerian","ar":"نيجيرية"}, name: {"fr":"Nigeria","en":"Nigeria","ar":"نيجيريا"}, aliases: ["nigeria"] },
    { code: "ZA", demonym: {"fr":"Sud-Africaine","en":"South African","ar":"جنوب أفريقية"}, name: {"fr":"Afrique du Sud","en":"South Africa","ar":"جنوب أفريقيا"}, aliases: ["afrique du sud","south africa"] },
    { code: "RU", demonym: {"fr":"Russe","en":"Russian","ar":"روسية"}, name: {"fr":"Russie","en":"Russia","ar":"روسيا"}, aliases: ["russie","russia"] },
    { code: "UA", demonym: {"fr":"Ukrainienne","en":"Ukrainian","ar":"أوكرانية"}, name: {"fr":"Ukraine","en":"Ukraine","ar":"أوكرانيا"}, aliases: ["ukraine"] },
    { code: "PL", demonym: {"fr":"Polonaise","en":"Polish","ar":"بولندية"}, name: {"fr":"Pologne","en":"Poland","ar":"بولندا"}, aliases: ["pologne","poland"] },
    { code: "SE", demonym: {"fr":"Suédoise","en":"Swedish","ar":"سويدية"}, name: {"fr":"Suède","en":"Sweden","ar":"السويد"}, aliases: ["suede","sweden"] },
    { code: "NO", demonym: {"fr":"Norvégienne","en":"Norwegian","ar":"نرويجية"}, name: {"fr":"Norvège","en":"Norway","ar":"النرويج"}, aliases: ["norvege","norway"] },
    { code: "DK", demonym: {"fr":"Danoise","en":"Danish","ar":"دنماركية"}, name: {"fr":"Danemark","en":"Denmark","ar":"الدنمارك"}, aliases: ["danemark","denmark"] },
    { code: "FI", demonym: {"fr":"Finlandaise","en":"Finnish","ar":"فنلندية"}, name: {"fr":"Finlande","en":"Finland","ar":"فنلندا"}, aliases: ["finlande","finland"] },
    { code: "AT", demonym: {"fr":"Autrichienne","en":"Austrian","ar":"نمساوية"}, name: {"fr":"Autriche","en":"Austria","ar":"النمسا"}, aliases: ["autriche","austria"] },
    { code: "IE", demonym: {"fr":"Irlandaise","en":"Irish","ar":"أيرلندية"}, name: {"fr":"Irlande","en":"Ireland","ar":"أيرلندا"}, aliases: ["irlande","ireland"] },
    { code: "GR", demonym: {"fr":"Grecque","en":"Greek","ar":"يونانية"}, name: {"fr":"Grèce","en":"Greece","ar":"اليونان"}, aliases: ["grece","greece"] },
    { code: "RO", demonym: {"fr":"Roumaine","en":"Romanian","ar":"رومانية"}, name: {"fr":"Roumanie","en":"Romania","ar":"رومانيا"}, aliases: ["roumanie","romania"] },
    { code: "HU", demonym: {"fr":"Hongroise","en":"Hungarian","ar":"مجرية"}, name: {"fr":"Hongrie","en":"Hungary","ar":"المجر"}, aliases: ["hongrie","hungary"] },
    { code: "CZ", demonym: {"fr":"Tchèque","en":"Czech","ar":"تشيكية"}, name: {"fr":"République tchèque","en":"Czech Republic","ar":"التشيك"}, aliases: ["tcheque","czech"] },
    { code: "CN", demonym: {"fr":"Chinoise","en":"Chinese","ar":"صينية"}, name: {"fr":"Chine","en":"China","ar":"الصين"}, aliases: ["chine","china"] },
    { code: "JP", demonym: {"fr":"Japonaise","en":"Japanese","ar":"يابانية"}, name: {"fr":"Japon","en":"Japan","ar":"اليابان"}, aliases: ["japon","japan"] },
    { code: "KR", demonym: {"fr":"Sud-Coréenne","en":"South Korean","ar":"كورية جنوبية"}, name: {"fr":"Corée du Sud","en":"South Korea","ar":"كوريا الجنوبية"}, aliases: ["coree du sud","korea"] },
    { code: "IN", demonym: {"fr":"Indienne","en":"Indian","ar":"هندية"}, name: {"fr":"Inde","en":"India","ar":"الهند"}, aliases: ["inde","india"] },
    { code: "PK", demonym: {"fr":"Pakistanaise","en":"Pakistani","ar":"باكستانية"}, name: {"fr":"Pakistan","en":"Pakistan","ar":"باكستان"}, aliases: ["pakistan"] },
    { code: "BR", demonym: {"fr":"Brésilienne","en":"Brazilian","ar":"برازيلية"}, name: {"fr":"Brésil","en":"Brazil","ar":"البرازيل"}, aliases: ["bresil","brazil"] },
    { code: "AR", demonym: {"fr":"Argentine","en":"Argentine","ar":"أرجنتينية"}, name: {"fr":"Argentine","en":"Argentina","ar":"الأرجنتين"}, aliases: ["argentine","argentina"] },
    { code: "MX", demonym: {"fr":"Mexicaine","en":"Mexican","ar":"مكسيكية"}, name: {"fr":"Mexique","en":"Mexico","ar":"المكسيك"}, aliases: ["mexique","mexico"] },
    { code: "CL", demonym: {"fr":"Chilienne","en":"Chilean","ar":"تشيلية"}, name: {"fr":"Chili","en":"Chile","ar":"تشيلي"}, aliases: ["chili","chile"] },
    { code: "CO", demonym: {"fr":"Colombienne","en":"Colombian","ar":"كولومبية"}, name: {"fr":"Colombie","en":"Colombia","ar":"كولومبيا"}, aliases: ["colombie","colombia"] },
    { code: "AU", demonym: {"fr":"Australienne","en":"Australian","ar":"أسترالية"}, name: {"fr":"Australie","en":"Australia","ar":"أستراليا"}, aliases: ["australie","australia"] },
    { code: "NZ", demonym: {"fr":"Néo-Zélandaise","en":"New Zealander","ar":"نيوزيلندية"}, name: {"fr":"Nouvelle-Zélande","en":"New Zealand","ar":"نيوزيلندا"}, aliases: ["nouvelle-zelande","new zealand"] },
    { code: "LB", demonym: {"fr":"Libanaise","en":"Lebanese","ar":"لبنانية"}, name: {"fr":"Liban","en":"Lebanon","ar":"لبنان"}, aliases: ["liban","lebanon"] },
    { code: "JO", demonym: {"fr":"Jordanienne","en":"Jordanian","ar":"أردنية"}, name: {"fr":"Jordanie","en":"Jordan","ar":"الأردن"}, aliases: ["jordanie","jordan"] },
    { code: "IQ", demonym: {"fr":"Irakienne","en":"Iraqi","ar":"عراقية"}, name: {"fr":"Irak","en":"Iraq","ar":"العراق"}, aliases: ["irak","iraq"] },
    { code: "SY", demonym: {"fr":"Syrienne","en":"Syrian","ar":"سورية"}, name: {"fr":"Syrie","en":"Syria","ar":"سوريا"}, aliases: ["syrie","syria"] },
    { code: "YE", demonym: {"fr":"Yéménite","en":"Yemeni","ar":"يمنية"}, name: {"fr":"Yémen","en":"Yemen","ar":"اليمن"}, aliases: ["yemen"] },
    { code: "OM", demonym: {"fr":"Omanaise","en":"Omani","ar":"عمانية"}, name: {"fr":"Oman","en":"Oman","ar":"عمان"}, aliases: ["oman"] },
    { code: "BH", demonym: {"fr":"Bahreïnienne","en":"Bahraini","ar":"بحرينية"}, name: {"fr":"Bahreïn","en":"Bahrain","ar":"البحرين"}, aliases: ["bahrein","bahrain"] },
    { code: "LY", demonym: {"fr":"Libyenne","en":"Libyan","ar":"ليبية"}, name: {"fr":"Libye","en":"Libya","ar":"ليبيا"}, aliases: ["libye","libya"] },
    { code: "SD", demonym: {"fr":"Soudanaise","en":"Sudanese","ar":"سودانية"}, name: {"fr":"Soudan","en":"Sudan","ar":"السودان"}, aliases: ["soudan","sudan"] },
    { code: "NE", demonym: {"fr":"Nigérienne","en":"Nigerien","ar":"نيجرية"}, name: {"fr":"Niger","en":"Niger","ar":"النيجر"}, aliases: ["niger"] },
    { code: "TD", demonym: {"fr":"Tchadienne","en":"Chadian","ar":"تشادية"}, name: {"fr":"Tchad","en":"Chad","ar":"تشاد"}, aliases: ["tchad","chad"] },
    { code: "BF", demonym: {"fr":"Burkinabè","en":"Burkinabe","ar":"بوركينية"}, name: {"fr":"Burkina Faso","en":"Burkina Faso","ar":"بوركينا فاسو"}, aliases: ["burkina"] },
    { code: "BJ", demonym: {"fr":"Béninoise","en":"Beninese","ar":"بنينية"}, name: {"fr":"Bénin","en":"Benin","ar":"بنين"}, aliases: ["benin"] },
    { code: "TG", demonym: {"fr":"Togolaise","en":"Togolese","ar":"توغولية"}, name: {"fr":"Togo","en":"Togo","ar":"توغو"}, aliases: ["togo"] },
    { code: "GH", demonym: {"fr":"Ghanéenne","en":"Ghanaian","ar":"غانية"}, name: {"fr":"Ghana","en":"Ghana","ar":"غانا"}, aliases: ["ghana"] },
    { code: "LU", demonym: {"fr":"Luxembourgeoise","en":"Luxembourgish","ar":"لوكسمبورغية"}, name: {"fr":"Luxembourg","en":"Luxembourg","ar":"لوكسمبورغ"}, aliases: ["luxembourg"] },
    { code: "MC", demonym: {"fr":"Monégasque","en":"Monegasque","ar":"موناكية"}, name: {"fr":"Monaco","en":"Monaco","ar":"موناكو"}, aliases: ["monaco","monegasque"] },
    { code: "AD", demonym: {"fr":"Andorrane","en":"Andorran","ar":"أندورية"}, name: {"fr":"Andorre","en":"Andorra","ar":"أندورا"}, aliases: ["andorre","andorra"] },
    { code: "SM", demonym: {"fr":"Saint-Marinaise","en":"Sammarinese","ar":"سان مارينية"}, name: {"fr":"Saint-Marin","en":"San Marino","ar":"سان مارينو"}, aliases: ["saint-marin","san marino"] },
    { code: "IS", demonym: {"fr":"Islandaise","en":"Icelandic","ar":"آيسلندية"}, name: {"fr":"Islande","en":"Iceland","ar":"آيسلندا"}, aliases: ["islande","iceland"] },
    { code: "MT", demonym: {"fr":"Maltaise","en":"Maltese","ar":"مالطية"}, name: {"fr":"Malte","en":"Malta","ar":"مالطا"}, aliases: ["malte","malta"] },
    { code: "CY", demonym: {"fr":"Chypriote","en":"Cypriot","ar":"قبرصية"}, name: {"fr":"Chypre","en":"Cyprus","ar":"قبرص"}, aliases: ["chypre","cyprus"] },
    { code: "RS", demonym: {"fr":"Serbe","en":"Serbian","ar":"صربية"}, name: {"fr":"Serbie","en":"Serbia","ar":"صربيا"}, aliases: ["serbie","serbia"] },
    { code: "HR", demonym: {"fr":"Croate","en":"Croatian","ar":"كرواتية"}, name: {"fr":"Croatie","en":"Croatia","ar":"كرواتيا"}, aliases: ["croatie","croatia"] },
    { code: "SI", demonym: {"fr":"Slovène","en":"Slovenian","ar":"سلوفينية"}, name: {"fr":"Slovénie","en":"Slovenia","ar":"سلوفينيا"}, aliases: ["slovenie","slovenia"] },
    { code: "BA", demonym: {"fr":"Bosnienne","en":"Bosnian","ar":"بوسنية"}, name: {"fr":"Bosnie-Herzégovine","en":"Bosnia and Herzegovina","ar":"البوسنة والهرسك"}, aliases: ["bosnie","bosnia"] },
    { code: "ME", demonym: {"fr":"Monténégrine","en":"Montenegrin","ar":"مونتينيغرية"}, name: {"fr":"Monténégro","en":"Montenegro","ar":"الجبل الأسود"}, aliases: ["montenegro"] },
    { code: "MK", demonym: {"fr":"Macédonienne","en":"Macedonian","ar":"مقدونية"}, name: {"fr":"Macédoine du Nord","en":"North Macedonia","ar":"مقدونيا الشمالية"}, aliases: ["macedoine","macedonia"] },
    { code: "AL", demonym: {"fr":"Albanaise","en":"Albanian","ar":"ألبانية"}, name: {"fr":"Albanie","en":"Albania","ar":"ألبانيا"}, aliases: ["albanie","albania"] },
    { code: "BG", demonym: {"fr":"Bulgare","en":"Bulgarian","ar":"بلغارية"}, name: {"fr":"Bulgarie","en":"Bulgaria","ar":"بلغاريا"}, aliases: ["bulgarie","bulgaria"] },
    { code: "SK", demonym: {"fr":"Slovaque","en":"Slovak","ar":"سلوفاكية"}, name: {"fr":"Slovaquie","en":"Slovakia","ar":"سلوفاكيا"}, aliases: ["slovaquie","slovakia"] },
    { code: "EE", demonym: {"fr":"Estonienne","en":"Estonian","ar":"إستونية"}, name: {"fr":"Estonie","en":"Estonia","ar":"إستونيا"}, aliases: ["estonie","estonia"] },
    { code: "LV", demonym: {"fr":"Lettone","en":"Latvian","ar":"لاتفية"}, name: {"fr":"Lettonie","en":"Latvia","ar":"لاتفيا"}, aliases: ["lettonie","latvia"] },
    { code: "LT", demonym: {"fr":"Lituanienne","en":"Lithuanian","ar":"ليتوانية"}, name: {"fr":"Lituanie","en":"Lithuania","ar":"ليتوانيا"}, aliases: ["lituanie","lithuania"] },
    { code: "BY", demonym: {"fr":"Biélorusse","en":"Belarusian","ar":"بيلاروسية"}, name: {"fr":"Biélorussie","en":"Belarus","ar":"بيلاروسيا"}, aliases: ["bielorussie","belarus"] },
    { code: "MD", demonym: {"fr":"Moldave","en":"Moldovan","ar":"مولدوفية"}, name: {"fr":"Moldavie","en":"Moldova","ar":"مولدوفا"}, aliases: ["moldavie","moldova"] },
    { code: "GE", demonym: {"fr":"Géorgienne","en":"Georgian","ar":"جورجية"}, name: {"fr":"Géorgie","en":"Georgia","ar":"جورجيا"}, aliases: ["georgie","georgia"] },
    { code: "AM", demonym: {"fr":"Arménienne","en":"Armenian","ar":"أرمينية"}, name: {"fr":"Arménie","en":"Armenia","ar":"أرمينيا"}, aliases: ["armenie","armenia"] },
    { code: "AZ", demonym: {"fr":"Azerbaïdjanaise","en":"Azerbaijani","ar":"أذربيجانية"}, name: {"fr":"Azerbaïdjan","en":"Azerbaijan","ar":"أذربيجان"}, aliases: ["azerbaidjan","azerbaijan"] },
    { code: "KZ", demonym: {"fr":"Kazakhe","en":"Kazakhstani","ar":"كازاخستانية"}, name: {"fr":"Kazakhstan","en":"Kazakhstan","ar":"كازاخستان"}, aliases: ["kazakhstan"] },
    { code: "UZ", demonym: {"fr":"Ouzbèke","en":"Uzbek","ar":"أوزبكستانية"}, name: {"fr":"Ouzbékistan","en":"Uzbekistan","ar":"أوزبكستان"}, aliases: ["ouzbekistan","uzbekistan"] },
    { code: "TM", demonym: {"fr":"Turkmène","en":"Turkmen","ar":"تركمانستانية"}, name: {"fr":"Turkménistan","en":"Turkmenistan","ar":"تركمانستان"}, aliases: ["turkmenistan"] },
    { code: "KG", demonym: {"fr":"Kirghize","en":"Kyrgyzstani","ar":"قيرغيزستانية"}, name: {"fr":"Kirghizistan","en":"Kyrgyzstan","ar":"قيرغيزستان"}, aliases: ["kirghizistan","kyrgyzstan"] },
    { code: "TJ", demonym: {"fr":"Tadjike","en":"Tajikistani","ar":"طاجيكستانية"}, name: {"fr":"Tadjikistan","en":"Tajikistan","ar":"طاجيكستان"}, aliases: ["tadjikistan","tajikistan"] },
    { code: "IL", demonym: {"fr":"Israélienne","en":"Israeli","ar":"إسرائيلية"}, name: {"fr":"Israël","en":"Israel","ar":"إسرائيل"}, aliases: ["israel"] },
    { code: "PS", demonym: {"fr":"Palestinienne","en":"Palestinian","ar":"فلسطينية"}, name: {"fr":"Palestine","en":"Palestine","ar":"فلسطين"}, aliases: ["palestine"] },
    { code: "IR", demonym: {"fr":"Iranienne","en":"Iranian","ar":"إيرانية"}, name: {"fr":"Iran","en":"Iran","ar":"إيران"}, aliases: ["iran"] },
    { code: "AF", demonym: {"fr":"Afghane","en":"Afghan","ar":"أفغانية"}, name: {"fr":"Afghanistan","en":"Afghanistan","ar":"أفغانستان"}, aliases: ["afghanistan"] },
    { code: "BD", demonym: {"fr":"Bangladaise","en":"Bangladeshi","ar":"بنغلاديشية"}, name: {"fr":"Bangladesh","en":"Bangladesh","ar":"بنغلاديش"}, aliases: ["bangladesh"] },
    { code: "LK", demonym: {"fr":"Sri-Lankaise","en":"Sri Lankan","ar":"سريلانكية"}, name: {"fr":"Sri Lanka","en":"Sri Lanka","ar":"سريلانكا"}, aliases: ["sri lanka"] },
    { code: "NP", demonym: {"fr":"Népalaise","en":"Nepali","ar":"نيبالية"}, name: {"fr":"Népal","en":"Nepal","ar":"نيبال"}, aliases: ["nepal"] },
    { code: "MM", demonym: {"fr":"Birmane","en":"Burmese","ar":"ميانمارية"}, name: {"fr":"Birmanie","en":"Myanmar","ar":"ميانمار"}, aliases: ["birmanie","myanmar","burma"] },
    { code: "TH", demonym: {"fr":"Thaïlandaise","en":"Thai","ar":"تايلاندية"}, name: {"fr":"Thaïlande","en":"Thailand","ar":"تايلاند"}, aliases: ["thailande","thailand","siam"] },
    { code: "VN", demonym: {"fr":"Vietnamienne","en":"Vietnamese","ar":"فيتنامية"}, name: {"fr":"Vietnam","en":"Vietnam","ar":"فيتنام"}, aliases: ["vietnam"] },
    { code: "KH", demonym: {"fr":"Cambodgienne","en":"Cambodian","ar":"كمبودية"}, name: {"fr":"Cambodge","en":"Cambodia","ar":"كمبوديا"}, aliases: ["cambodge","cambodia"] },
    { code: "LA", demonym: {"fr":"Laotienne","en":"Lao","ar":"لاوسية"}, name: {"fr":"Laos","en":"Laos","ar":"لاوس"}, aliases: ["laos"] },
    { code: "MY", demonym: {"fr":"Malaisienne","en":"Malaysian","ar":"ماليزية"}, name: {"fr":"Malaisie","en":"Malaysia","ar":"ماليزيا"}, aliases: ["malaisie","malaysia"] },
    { code: "SG", demonym: {"fr":"Singapourienne","en":"Singaporean","ar":"سنغافورية"}, name: {"fr":"Singapour","en":"Singapore","ar":"سنغافورة"}, aliases: ["singapour","singapore"] },
    { code: "ID", demonym: {"fr":"Indonésienne","en":"Indonesian","ar":"إندونيسية"}, name: {"fr":"Indonésie","en":"Indonesia","ar":"إندونيسيا"}, aliases: ["indonesie","indonesia"] },
    { code: "PH", demonym: {"fr":"Philippine","en":"Filipino","ar":"فلبينية"}, name: {"fr":"Philippines","en":"Philippines","ar":"الفلبين"}, aliases: ["philippines","filipino"] },
    { code: "PE", demonym: {"fr":"Péruvienne","en":"Peruvian","ar":"بيروفية"}, name: {"fr":"Pérou","en":"Peru","ar":"بيرو"}, aliases: ["perou","peru"] },
    { code: "VE", demonym: {"fr":"Vénézuélienne","en":"Venezuelan","ar":"فنزويلية"}, name: {"fr":"Venezuela","en":"Venezuela","ar":"فنزويلا"}, aliases: ["venezuela"] },
    { code: "EC", demonym: {"fr":"Équatorienne","en":"Ecuadorian","ar":"إكوادورية"}, name: {"fr":"Équateur","en":"Ecuador","ar":"الإكوادور"}, aliases: ["equateur","ecuador"] },
    { code: "BO", demonym: {"fr":"Bolivienne","en":"Bolivian","ar":"بوليفية"}, name: {"fr":"Bolivie","en":"Bolivia","ar":"بوليفيا"}, aliases: ["bolivie","bolivia"] },
    { code: "PY", demonym: {"fr":"Paraguayenne","en":"Paraguayan","ar":"باراغوايانية"}, name: {"fr":"Paraguay","en":"Paraguay","ar":"باراغواي"}, aliases: ["paraguay"] },
    { code: "UY", demonym: {"fr":"Uruguayenne","en":"Uruguayan","ar":"أوروغوايانية"}, name: {"fr":"Uruguay","en":"Uruguay","ar":"أوروغواي"}, aliases: ["uruguay"] },
    { code: "CR", demonym: {"fr":"Costaricienne","en":"Costa Rican","ar":"كوستاريكية"}, name: {"fr":"Costa Rica","en":"Costa Rica","ar":"كوستاريكا"}, aliases: ["costa rica"] },
    { code: "PA", demonym: {"fr":"Panaméenne","en":"Panamanian","ar":"بنمية"}, name: {"fr":"Panama","en":"Panama","ar":"بنما"}, aliases: ["panama"] },
    { code: "CU", demonym: {"fr":"Cubaine","en":"Cuban","ar":"كوبية"}, name: {"fr":"Cuba","en":"Cuba","ar":"كوبا"}, aliases: ["cuba"] },
    { code: "DO", demonym: {"fr":"Dominicaine","en":"Dominican","ar":"دومينيكانية"}, name: {"fr":"République dominicaine","en":"Dominican Republic","ar":"جمهورية الدومينيكان"}, aliases: ["republique dominicaine","dominican republic"] },
    { code: "HT", demonym: {"fr":"Haïtienne","en":"Haitian","ar":"هايتية"}, name: {"fr":"Haïti","en":"Haiti","ar":"هايتي"}, aliases: ["haiti"] },
    { code: "JM", demonym: {"fr":"Jamaïcaine","en":"Jamaican","ar":"جامايكية"}, name: {"fr":"Jamaïque","en":"Jamaica","ar":"جامايكا"}, aliases: ["jamaique","jamaica"] },
    { code: "TT", demonym: {"fr":"Trinidadienne","en":"Trinidadian","ar":"ترينيدادية"}, name: {"fr":"Trinité-et-Tobago","en":"Trinidad and Tobago","ar":"ترينيداد وتوباغو"}, aliases: ["trinite-et-tobago","trinidad"] },
    { code: "KE", demonym: {"fr":"Kényane","en":"Kenyan","ar":"كينية"}, name: {"fr":"Kenya","en":"Kenya","ar":"كينيا"}, aliases: ["kenya"] },
    { code: "TZ", demonym: {"fr":"Tanzanienne","en":"Tanzanian","ar":"تنزانية"}, name: {"fr":"Tanzanie","en":"Tanzania","ar":"تنزانيا"}, aliases: ["tanzanie","tanzania"] },
    { code: "UG", demonym: {"fr":"Ougandaise","en":"Ugandan","ar":"أوغندية"}, name: {"fr":"Ouganda","en":"Uganda","ar":"أوغندا"}, aliases: ["ouganda","uganda"] },
    { code: "RW", demonym: {"fr":"Rwandaise","en":"Rwandan","ar":"رواندية"}, name: {"fr":"Rwanda","en":"Rwanda","ar":"رواندا"}, aliases: ["rwanda"] },
    { code: "ET", demonym: {"fr":"Éthiopienne","en":"Ethiopian","ar":"إثيوبية"}, name: {"fr":"Éthiopie","en":"Ethiopia","ar":"إثيوبيا"}, aliases: ["ethiopie","ethiopia"] },
    { code: "SO", demonym: {"fr":"Somalienne","en":"Somali","ar":"صومالية"}, name: {"fr":"Somalie","en":"Somalia","ar":"الصومال"}, aliases: ["somalie","somalia"] },
    { code: "DJ", demonym: {"fr":"Djiboutienne","en":"Djiboutian","ar":"جيبوتية"}, name: {"fr":"Djibouti","en":"Djibouti","ar":"جيبوتي"}, aliases: ["djibouti"] },
    { code: "KM", demonym: {"fr":"Comorienne","en":"Comorian","ar":"قمريّة"}, name: {"fr":"Comores","en":"Comoros","ar":"جزر القمر"}, aliases: ["comores","comoros"] },
    { code: "MG", demonym: {"fr":"Malgache","en":"Malagasy","ar":"مدغشقرية"}, name: {"fr":"Madagascar","en":"Madagascar","ar":"مدغشقر"}, aliases: ["madagascar","malgache"] },
    { code: "MU", demonym: {"fr":"Mauricienne","en":"Mauritian","ar":"موريشيوسية"}, name: {"fr":"Maurice","en":"Mauritius","ar":"موريشيوس"}, aliases: ["maurice","mauritius"] },
    { code: "SC", demonym: {"fr":"Seychelloise","en":"Seychellois","ar":"سيشيلية"}, name: {"fr":"Seychelles","en":"Seychelles","ar":"سيشل"}, aliases: ["seychelles"] },
    { code: "NA", demonym: {"fr":"Namibienne","en":"Namibian","ar":"ناميبية"}, name: {"fr":"Namibie","en":"Namibia","ar":"ناميبيا"}, aliases: ["namibie","namibia"] },
    { code: "BW", demonym: {"fr":"Botswanaise","en":"Motswana","ar":"بوتسوانية"}, name: {"fr":"Botswana","en":"Botswana","ar":"بوتسوانا"}, aliases: ["botswana"] },
    { code: "ZM", demonym: {"fr":"Zambienne","en":"Zambian","ar":"زامبية"}, name: {"fr":"Zambie","en":"Zambia","ar":"زامبيا"}, aliases: ["zambie","zambia"] },
    { code: "ZW", demonym: {"fr":"Zimbabwéenne","en":"Zimbabwean","ar":"زيمبابوية"}, name: {"fr":"Zimbabwe","en":"Zimbabwe","ar":"زيمبابوي"}, aliases: ["zimbabwe"] },
    { code: "AO", demonym: {"fr":"Angolaise","en":"Angolan","ar":"أنغولية"}, name: {"fr":"Angola","en":"Angola","ar":"أنغولا"}, aliases: ["angola"] },
    { code: "MZ", demonym: {"fr":"Mozambicaine","en":"Mozambican","ar":"موزمبيقية"}, name: {"fr":"Mozambique","en":"Mozambique","ar":"موزمبيق"}, aliases: ["mozambique"] },
    { code: "MV", demonym: {"fr":"Maldivienne","en":"Maldivian","ar":"مالديفية"}, name: {"fr":"Maldives","en":"Maldives","ar":"المالديف"}, aliases: ["maldives","maldivian","maldivienne"] },
    { code: "BN", demonym: {"fr":"Brunéienne","en":"Bruneian","ar":"بروناوية"}, name: {"fr":"Brunei","en":"Brunei","ar":"بروناي"}, aliases: ["brunei","bruneian"] },
    { code: "BT", demonym: {"fr":"Bhoutanaise","en":"Bhutanese","ar":"بوتانية"}, name: {"fr":"Bhoutan","en":"Bhutan","ar":"بوتان"}, aliases: ["bhoutan","bhutan"] },
    { code: "MN", demonym: {"fr":"Mongole","en":"Mongolian","ar":"منغولية"}, name: {"fr":"Mongolie","en":"Mongolia","ar":"منغوليا"}, aliases: ["mongolie","mongolia"] },
    { code: "BS", demonym: {"fr":"Bahaméenne","en":"Bahamian","ar":"باهامية"}, name: {"fr":"Bahamas","en":"Bahamas","ar":"جزر البهاما"}, aliases: ["bahamas","bahamian"] },
    { code: "BB", demonym: {"fr":"Barbadienne","en":"Barbadian","ar":"باربادوسية"}, name: {"fr":"Barbade","en":"Barbados","ar":"باربادوس"}, aliases: ["barbade","barbados"] },
    { code: "BZ", demonym: {"fr":"Bélizienne","en":"Belizean","ar":"بليزية"}, name: {"fr":"Belize","en":"Belize","ar":"بليز"}, aliases: ["belize"] },
    { code: "GY", demonym: {"fr":"Guyanienne","en":"Guyanese","ar":"غيانية"}, name: {"fr":"Guyana","en":"Guyana","ar":"غيانا"}, aliases: ["guyana"] },
    { code: "SR", demonym: {"fr":"Surinamaise","en":"Surinamese","ar":"سورينامية"}, name: {"fr":"Suriname","en":"Suriname","ar":"سورينام"}, aliases: ["suriname"] },
    { code: "FJ", demonym: {"fr":"Fidjienne","en":"Fijian","ar":"فيجية"}, name: {"fr":"Fidji","en":"Fiji","ar":"فيجي"}, aliases: ["fidji","fiji"] },
    { code: "PG", demonym: {"fr":"Papouasienne","en":"Papua New Guinean","ar":"بابوا غينيا الجديدة"}, name: {"fr":"Papouasie-Nouvelle-Guinée","en":"Papua New Guinea","ar":"بابوا غينيا الجديدة"}, aliases: ["papouasie","papua"] },
    { code: "VU", demonym: {"fr":"Vanuatuane","en":"Ni-Vanuatu","ar":"فانواتية"}, name: {"fr":"Vanuatu","en":"Vanuatu","ar":"فانواتو"}, aliases: ["vanuatu"] },
    { code: "WS", demonym: {"fr":"Samoane","en":"Samoan","ar":"ساموية"}, name: {"fr":"Samoa","en":"Samoa","ar":"ساموا"}, aliases: ["samoa"] },
    { code: "TO", demonym: {"fr":"Tongienne","en":"Tongan","ar":"تونغية"}, name: {"fr":"Tonga","en":"Tonga","ar":"تونغا"}, aliases: ["tonga"] },
    { code: "SB", demonym: {"fr":"Salomonienne","en":"Solomon Islander","ar":"جزر سليمان"}, name: {"fr":"Îles Salomon","en":"Solomon Islands","ar":"جزر سليمان"}, aliases: ["salomon","solomon"] },
    { code: "FM", demonym: {"fr":"Micronésienne","en":"Micronesian","ar":"ميكرونيزية"}, name: {"fr":"Micronésie","en":"Micronesia","ar":"ولايات ميكرونيسيا المتحدة"}, aliases: ["micronesie","micronesia"] },
    { code: "PW", demonym: {"fr":"Palaosienne","en":"Palauan","ar":"بالاوية"}, name: {"fr":"Palaos","en":"Palau","ar":"بالاو"}, aliases: ["palaos","palau"] },
    { code: "MH", demonym: {"fr":"Marshallaise","en":"Marshallese","ar":"مارشالية"}, name: {"fr":"Îles Marshall","en":"Marshall Islands","ar":"جزر مارشال"}, aliases: ["marshall"] },
    { code: "KI", demonym: {"fr":"Kiribatienne","en":"I-Kiribati","ar":"كيريباتية"}, name: {"fr":"Kiribati","en":"Kiribati","ar":"كيريباتي"}, aliases: ["kiribati"] },
    { code: "NR", demonym: {"fr":"Nauruane","en":"Nauruan","ar":"ناورونية"}, name: {"fr":"Nauru","en":"Nauru","ar":"ناورو"}, aliases: ["nauru"] },
    { code: "TV", demonym: {"fr":"Tuvaluane","en":"Tuvaluan","ar":"توفالوية"}, name: {"fr":"Tuvalu","en":"Tuvalu","ar":"توفالو"}, aliases: ["tuvalu"] },
    { code: "CV", demonym: {"fr":"Cap-Verdienne","en":"Cape Verdean","ar":"رأس أخضرية"}, name: {"fr":"Cap-Vert","en":"Cape Verde","ar":"الرأس الأخضر"}, aliases: ["cap-vert","cape verde"] },
    { code: "ST", demonym: {"fr":"Santoméenne","en":"São Toméan","ar":"ساو تومية"}, name: {"fr":"Sao Tomé-et-Principe","en":"Sao Tome and Principe","ar":"ساو تومي وبرينسيب"}, aliases: ["sao tome","sao tome-et-principe"] },
    { code: "GQ", demonym: {"fr":"Équato-Guinéenne","en":"Equatorial Guinean","ar":"غينية استوائية"}, name: {"fr":"Guinée équatoriale","en":"Equatorial Guinea","ar":"غينيا الاستوائية"}, aliases: ["guinee equatoriale","equatorial guinea"] },
    { code: "GW", demonym: {"fr":"Bissau-Guinéenne","en":"Bissau-Guinean","ar":"غينيا بيساو"}, name: {"fr":"Guinée-Bissau","en":"Guinea-Bissau","ar":"غينيا بيساو"}, aliases: ["guinee-bissau","guinea-bissau"] },
    { code: "SL", demonym: {"fr":"Sierra-Léonaise","en":"Sierra Leonean","ar":"سيراليونية"}, name: {"fr":"Sierra Leone","en":"Sierra Leone","ar":"سيراليون"}, aliases: ["sierra leone"] },
    { code: "LR", demonym: {"fr":"Libérienne","en":"Liberian","ar":"ليبيرية"}, name: {"fr":"Liberia","en":"Liberia","ar":"ليبيريا"}, aliases: ["liberia"] },
    { code: "CF", demonym: {"fr":"Centrafricaine","en":"Central African","ar":"وسط أفريقية"}, name: {"fr":"République centrafricaine","en":"Central African Republic","ar":"جمهورية أفريقيا الوسطى"}, aliases: ["centrafrique","central african republic"] },
    { code: "SS", demonym: {"fr":"Sud-Soudanaise","en":"South Sudanese","ar":"جنوب سودانية"}, name: {"fr":"Soudan du Sud","en":"South Sudan","ar":"جنوب السودان"}, aliases: ["soudan du sud","south sudan"] },
    { code: "ER", demonym: {"fr":"Érythréenne","en":"Eritrean","ar":"إريترية"}, name: {"fr":"Érythrée","en":"Eritrea","ar":"إريتريا"}, aliases: ["erythree","eritrea"] },
    { code: "BI", demonym: {"fr":"Burundaise","en":"Burundian","ar":"بوروندية"}, name: {"fr":"Burundi","en":"Burundi","ar":"بوروندي"}, aliases: ["burundi"] },
    { code: "MW", demonym: {"fr":"Malawienne","en":"Malawian","ar":"مالاوية"}, name: {"fr":"Malawi","en":"Malawi","ar":"مالاوي"}, aliases: ["malawi"] },
    { code: "LS", demonym: {"fr":"Lésothienne","en":"Basotho","ar":"ليسوتوية"}, name: {"fr":"Lesotho","en":"Lesotho","ar":"ليسوتو"}, aliases: ["lesotho"] },
    { code: "SZ", demonym: {"fr":"Swazie","en":"Swazi","ar":"سوازية"}, name: {"fr":"Eswatini","en":"Eswatini","ar":"إسواتيني"}, aliases: ["eswatini","swaziland"] },
    { code: "LI", demonym: {"fr":"Liechtensteinoise","en":"Liechtensteiner","ar":"ليختنشتاينية"}, name: {"fr":"Liechtenstein","en":"Liechtenstein","ar":"ليختنشتاين"}, aliases: ["liechtenstein"] },
    { code: "VA", demonym: {"fr":"Vaticane","en":"Vatican","ar":"فاتيكانية"}, name: {"fr":"Vatican","en":"Vatican City","ar":"الفاتيكان"}, aliases: ["vatican"] },
    { code: "AG", demonym: {"fr":"Antiguaise","en":"Antiguan","ar":"أنتيغوية"}, name: {"fr":"Antigua-et-Barbuda","en":"Antigua and Barbuda","ar":"أنتيغوا وبربودا"}, aliases: ["antigua"] },
    { code: "DM", demonym: {"fr":"Dominiquaise","en":"Dominican","ar":"دومينيكية"}, name: {"fr":"Dominique","en":"Dominica","ar":"دومينيكا"}, aliases: ["dominique","dominica"] },
    { code: "GD", demonym: {"fr":"Grenadienne","en":"Grenadian","ar":"غرينادية"}, name: {"fr":"Grenade","en":"Grenada","ar":"غرينادا"}, aliases: ["grenade","grenada"] },
    { code: "KN", demonym: {"fr":"Kittitienne","en":"Kittitian","ar":"سانت كيتسية"}, name: {"fr":"Saint-Christophe-et-Niévès","en":"Saint Kitts and Nevis","ar":"سانت كيتس ونيفيس"}, aliases: ["saint-kitts","st kitts"] },
    { code: "LC", demonym: {"fr":"Sainte-Lucienne","en":"Saint Lucian","ar":"سانت لوسية"}, name: {"fr":"Sainte-Lucie","en":"Saint Lucia","ar":"سانت لوسيا"}, aliases: ["sainte-lucie","st lucia"] },
    { code: "VC", demonym: {"fr":"Vincentienne","en":"Vincentian","ar":"سانت فنسنتية"}, name: {"fr":"Saint-Vincent-et-les-Grenadines","en":"Saint Vincent and the Grenadines","ar":"سانت فنسنت والغرينادين"}, aliases: ["saint-vincent","st vincent"] },
    { code: "TL", demonym: {"fr":"Est-Timoraise","en":"East Timorese","ar":"تيمورية شرقية"}, name: {"fr":"Timor oriental","en":"East Timor","ar":"تيمور الشرقية"}, aliases: ["timor","timor-leste","east timor"] },
    { code: "KP", demonym: {"fr":"Nord-Coréenne","en":"North Korean","ar":"كورية شمالية"}, name: {"fr":"Corée du Nord","en":"North Korea","ar":"كوريا الشمالية"}, aliases: ["coree du nord","north korea"] },
    { code: "HK", demonym: {"fr":"Hongkongaise","en":"Hong Konger","ar":"هونغ كونغية"}, name: {"fr":"Hong Kong","en":"Hong Kong","ar":"هونغ كونغ"}, aliases: ["hong kong","hong-kong"] },
    { code: "MO", demonym: {"fr":"Macaïenne","en":"Macanese","ar":"ماكاوية"}, name: {"fr":"Macao","en":"Macau","ar":"ماكاو"}, aliases: ["macao","macau"] },
    { code: "TW", demonym: {"fr":"Taïwanaise","en":"Taiwanese","ar":"تايوانية"}, name: {"fr":"Taïwan","en":"Taiwan","ar":"تايوان"}, aliases: ["taiwan","taipei"] },
    { code: "PR", demonym: {"fr":"Portoricaine","en":"Puerto Rican","ar":"بورتوريكية"}, name: {"fr":"Porto Rico","en":"Puerto Rico","ar":"بورتوريكو"}, aliases: ["puerto rico","porto rico"] },
    { code: "GF", demonym: {"fr":"Guyanaise","en":"French Guianese","ar":"غويانية فرنسية"}, name: {"fr":"Guyane française","en":"French Guiana","ar":"غويانا الفرنسية"}, aliases: ["guyane","guyane francaise"] },
    { code: "GP", demonym: {"fr":"Guadeloupéenne","en":"Guadeloupean","ar":"غوادلوبية"}, name: {"fr":"Guadeloupe","en":"Guadeloupe","ar":"غوادلوب"}, aliases: ["guadeloupe"] },
    { code: "MQ", demonym: {"fr":"Martiniquaise","en":"Martinican","ar":"مارتينيكية"}, name: {"fr":"Martinique","en":"Martinique","ar":"مارتينيك"}, aliases: ["martinique"] },
    { code: "RE", demonym: {"fr":"Réunionnaise","en":"Reunionese","ar":"ريونيونية"}, name: {"fr":"La Réunion","en":"Reunion","ar":"لا ريونيون"}, aliases: ["reunion","la reunion"] },
    { code: "YT", demonym: {"fr":"Mahoraise","en":"Mahoran","ar":"مايوتية"}, name: {"fr":"Mayotte","en":"Mayotte","ar":"مايوت"}, aliases: ["mayotte"] },
    { code: "NC", demonym: {"fr":"Néo-Calédonienne","en":"New Caledonian","ar":"كاليدونية جديدة"}, name: {"fr":"Nouvelle-Calédonie","en":"New Caledonia","ar":"كاليدونيا الجديدة"}, aliases: ["nouvelle-caledonie","new caledonia"] },
    { code: "PF", demonym: {"fr":"Polynésienne","en":"French Polynesian","ar":"بولينيزية فرنسية"}, name: {"fr":"Polynésie française","en":"French Polynesia","ar":"بولينيزيا الفرنسية"}, aliases: ["polynesie","tahiti"] },
    { code: "GL", demonym: {"fr":"Groenlandaise","en":"Greenlandic","ar":"غرينلاندية"}, name: {"fr":"Groenland","en":"Greenland","ar":"غرينلاند"}, aliases: ["groenland","greenland"] },
    { code: "FO", demonym: {"fr":"Féroïenne","en":"Faroese","ar":"فاروية"}, name: {"fr":"Îles Féroé","en":"Faroe Islands","ar":"جزر فارو"}, aliases: ["feroe","faroe"] },
    { code: "GI", demonym: {"fr":"Gibraltarienne","en":"Gibraltarian","ar":"جبل طارقية"}, name: {"fr":"Gibraltar","en":"Gibraltar","ar":"جبل طارق"}, aliases: ["gibraltar"] },
    { code: "BM", demonym: {"fr":"Bermudienne","en":"Bermudian","ar":"برمودية"}, name: {"fr":"Bermudes","en":"Bermuda","ar":"برمودا"}, aliases: ["bermudes","bermuda"] },
    { code: "KY", demonym: {"fr":"Caïmanaise","en":"Caymanian","ar":"كايمانية"}, name: {"fr":"Îles Caïmans","en":"Cayman Islands","ar":"جزر كايمان"}, aliases: ["caimans","cayman"] },
    { code: "AW", demonym: {"fr":"Arubaise","en":"Aruban","ar":"أروبية"}, name: {"fr":"Aruba","en":"Aruba","ar":"أروبا"}, aliases: ["aruba"] },
    { code: "CW", demonym: {"fr":"Curaçaoane","en":"Curacaoan","ar":"كوراساوية"}, name: {"fr":"Curaçao","en":"Curacao","ar":"كوراساو"}, aliases: ["curacao"] },
    { code: "IM", demonym: {"fr":"Mannoise","en":"Manx","ar":"مانكسية"}, name: {"fr":"Île de Man","en":"Isle of Man","ar":"جزيرة مان"}, aliases: ["man","isle of man","ile de man"] },
    { code: "JE", demonym: {"fr":"Jersiaise","en":"Channel Islander","ar":"جيرزية"}, name: {"fr":"Jersey","en":"Jersey","ar":"جيرزي"}, aliases: ["jersey"] },
    { code: "GG", demonym: {"fr":"Guernesiaise","en":"Channel Islander","ar":"غيرنزية"}, name: {"fr":"Guernesey","en":"Guernsey","ar":"غيرنزي"}, aliases: ["guernesey","guernsey"] },
    { code: "SX", demonym: {"fr":"Saint-Martinoise","en":"Sint Maarten","ar":"سانت مارتينية"}, name: {"fr":"Saint-Martin (Pays-Bas)","en":"Sint Maarten","ar":"سينت مارتن"}, aliases: ["sint maarten","saint-martin"] },
    { code: "MF", demonym: {"fr":"Saint-Martinoise","en":"Saint-Martinoise","ar":"سانت مارتينية"}, name: {"fr":"Saint-Martin (France)","en":"Saint Martin","ar":"سانت مارتن الفرنسية"}, aliases: ["saint martin","saint-martin"] },
    { code: "BL", demonym: {"fr":"Barthéloméenne","en":"Barthélemois","ar":"بارثيلمية"}, name: {"fr":"Saint-Barthélemy","en":"Saint Barthélemy","ar":"سان بارتيلمي"}, aliases: ["saint-barthelemy","st barts"] },
    { code: "PM", demonym: {"fr":"Saint-Pierraise","en":"Saint-Pierrais","ar":"سان بييرية"}, name: {"fr":"Saint-Pierre-et-Miquelon","en":"Saint Pierre and Miquelon","ar":"سان بيير وميكلون"}, aliases: ["saint-pierre","saint-pierre-et-miquelon"] },
    { code: "WF", demonym: {"fr":"Wallisienne","en":"Wallisian","ar":"واليسية"}, name: {"fr":"Wallis-et-Futuna","en":"Wallis and Futuna","ar":"واليس وفوتونا"}, aliases: ["wallis","wallis-et-futuna"] },
    { code: "TC", demonym: {"fr":"Turquoise","en":"Turks and Caicos Islander","ar":"تيركسية وكايكوسية"}, name: {"fr":"Îles Turques-et-Caïques","en":"Turks and Caicos Islands","ar":"جزر توركس وكايكوس"}, aliases: ["turks and caicos","turques-et-caiques"] },
    { code: "MS", demonym: {"fr":"Montserratienne","en":"Montserratian","ar":"مونتسيراتية"}, name: {"fr":"Montserrat","en":"Montserrat","ar":"مونتسرات"}, aliases: ["montserrat"] },
    { code: "AI", demonym: {"fr":"Anguillane","en":"Anguillan","ar":"أنغويلية"}, name: {"fr":"Anguilla","en":"Anguilla","ar":"أنغويلا"}, aliases: ["anguilla"] },
    { code: "VG", demonym: {"fr":"Vierge britannique","en":"British Virgin Islander","ar":"جزر العذراء البريطانية"}, name: {"fr":"Îles Vierges britanniques","en":"British Virgin Islands","ar":"جزر العذراء البريطانية"}, aliases: ["bvi","virgin islands","vierges britanniques"] },
    { code: "VI", demonym: {"fr":"Vierge des États-Unis","en":"U.S. Virgin Islander","ar":"جزر العذراء الأمريكية"}, name: {"fr":"Îles Vierges des États-Unis","en":"U.S. Virgin Islands","ar":"جزر العذراء الأمريكية"}, aliases: ["usvi","vierges americaines"] },
    { code: "FK", demonym: {"fr":"Falklandaise","en":"Falkland Islander","ar":"فوكلاندية"}, name: {"fr":"Îles Malouines","en":"Falkland Islands","ar":"جزر فوكلاند"}, aliases: ["falkland","malouines"] },
    { code: "SH", demonym: {"fr":"Sainte-Hélène","en":"Saint Helenian","ar":"سانت هيلانية"}, name: {"fr":"Sainte-Hélène","en":"Saint Helena","ar":"سانت هيلانة"}, aliases: ["saint helena","sainte-helene"] },
    { code: "NU", demonym: {"fr":"Niouéenne","en":"Niuean","ar":"نيوية"}, name: {"fr":"Niue","en":"Niue","ar":"نييوي"}, aliases: ["niue"] },
    { code: "CK", demonym: {"fr":"Cookienne","en":"Cook Islander","ar":"جزر كوك"}, name: {"fr":"Îles Cook","en":"Cook Islands","ar":"جزر كوك"}, aliases: ["cook islands","iles cook"] },
    { code: "TK", demonym: {"fr":"Tokelauane","en":"Tokelauan","ar":"توكلوية"}, name: {"fr":"Tokelau","en":"Tokelau","ar":"توكيلاو"}, aliases: ["tokelau"] },
    { code: "AS", demonym: {"fr":"Samoane américaine","en":"American Samoan","ar":"ساموية أمريكية"}, name: {"fr":"Samoa américaines","en":"American Samoa","ar":"ساموا الأمريكية"}, aliases: ["american samoa","samoa americaines"] },
    { code: "GU", demonym: {"fr":"Guamanienne","en":"Guamanian","ar":"غوامية"}, name: {"fr":"Guam","en":"Guam","ar":"غوام"}, aliases: ["guam"] },
    { code: "MP", demonym: {"fr":"Mariannaise","en":"Northern Mariana Islander","ar":"ماريانية شمالية"}, name: {"fr":"Îles Mariannes du Nord","en":"Northern Mariana Islands","ar":"جزر ماريانا الشمالية"}, aliases: ["mariannes","mariana"] },
    { code: "EH", demonym: {"fr":"Sahraouie","en":"Sahrawi","ar":"صحراوية"}, name: {"fr":"Sahara occidental","en":"Western Sahara","ar":"الصحراء الغربية"}, aliases: ["sahara occidental","western sahara"] },
    { code: "BQ", demonym: {"fr":"Caribéenne néerlandaise","en":"Dutch Caribbean","ar":"كاريبية هولندية"}, name: {"fr":"Pays-Bas caribéens","en":"Caribbean Netherlands","ar":"الجزر الكاريبية الهولندية"}, aliases: ["bonaire","saba","saint-eustache"] },
  ];

  function cuNormalizeText(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function cuMatchNationality() { return hotelSection('views').cuMatchNationality.apply(this, arguments); }

  function cuNationalityLabel(code, l) {
    if (!code) return '';
    const lang = l || cuLang() || 'fr';
    const item = cuNationalities.find((n) => n.code === code.toUpperCase());
    if (!item) return code;
    return item.demonym[lang] || item.demonym.fr || item.demonym.en || item.name[lang] || item.name.fr || code;
  }

  function cuNationalitySelectorHtml() { return hotelSection('views').cuNationalitySelectorHtml.apply(this, arguments); }

  function cuWireNationalitySelectors() { return hotelSection('views').cuWireNationalitySelectors.apply(this, arguments); }

  function cuStayEditor() { return hotelSection('editors').cuStayEditor.apply(this, arguments); }

  const cuDraftMoney = n => (window.KiwiNumber?.format((n / 100), {minimumFractionDigits:2,maximumFractionDigits:2}) ?? (n / 100).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:2,maximumFractionDigits:2}));
  const cuDraftStatus = v => ({requested:tx('Demandée'),confirmed:tx('Confirmée'),checked_in:tx('En séjour'),completed:tx('Terminée'),cancelled:tx('Annulée'),no_show:tx('Non présenté')})[v] || v;
  function cuDraftRoom(id) { return window.__kiwiHotelInternal.part('folio').cuDraftRoom.apply(this, arguments); }
  function cuBillingLine(l, payers) { return window.__kiwiHotelInternal.part('folio').cuBillingLine.apply(this, arguments); }
  function cuDossierRooms(data) { return window.__kiwiHotelInternal.part('folio').cuDossierRooms.apply(this, arguments); }
  /* A billing breakage hides no room: the dossier lists its rooms with a
   * targeted reason instead of the blanket "indisponible", and the money form
   * is withheld until the stay data is repaired. Ticket #0003. */
  function cuBillingBlocked(code) { return window.__kiwiHotelInternal.part('folio').cuBillingBlocked.apply(this, arguments); }
  function cuBillingBody(data) { return window.__kiwiHotelInternal.part('folio').cuBillingBody.apply(this, arguments); }
  function cuDraftInput(form, extras) { return window.__kiwiHotelInternal.part('folio').cuDraftInput.apply(this, arguments); }
  function cuPrintDraft(saved) { return window.__kiwiHotelInternal.part('folio').cuPrintDraft.apply(this, arguments); }
  async function cuOpenDossier() { return hotelSection('editors').cuOpenDossier.apply(this, arguments); }

  function cuParseDelimitedLine() { return hotelSection('views').cuParseDelimitedLine.apply(this, arguments); }

  function cuHasGroupRecovery() { return hotelSection('views').cuHasGroupRecovery.apply(this, arguments); }

  async function cuGroupReservationModal() { return hotelSection('groups').cuGroupReservationModal.apply(this, arguments); }

  async function cuSubmitStay() { return hotelSection('editors').cuSubmitStay.apply(this, arguments); }

  async function cuCancelStay() { return hotelSection('editors').cuCancelStay.apply(this, arguments); }
  /* Arrivée et départ, depuis le journal de réception.
   *
   * Le journal listait les mouvements du jour sans permettre de les
   * enregistrer. On passe par l'action `status`, qui ne touche que le statut :
   * un `save` complet reconstruit le dossier à partir de ce qu'on envoie et
   * effacerait le téléphone, l'e-mail ou les voyageurs non renvoyés. */
  async function cuMoveStayStatus() { return hotelSection('views').cuMoveStayStatus.apply(this, arguments); }
  const cuCommercialByScope = new Map();
  /* Getters, not strings: each read names the formula in the current language. */
  const cuBoards = {
    get room_only() { return tx('Logement seul'); }, get bb() { return tx('Bed & Breakfast'); },
    get hb_lunch() { return tx('Demi-pension · déjeuner'); }, get hb_dinner() { return tx('Demi-pension · dîner'); },
    get full_board() { return tx('Pension complète'); },
  };
  const cuKinds = { get individual() { return tx('Particulier'); }, get agency() { return tx('Agence'); }, get company() { return tx('Société'); } };
  function cuStayQuoteSignature(form) { return window.__kiwiHotelInternal.part('rates').cuStayQuoteSignature.apply(this, arguments); }
  /* Direct-guest pricing, pure and shared (single editor + group modal +
   * unit tests): room nightly rate plus the meal supplement per person per
   * night, from the hotel's own type configuration — never a contract, never
   * an account. Mirrors priceDirectStay() server-side cent for cent; any
   * divergence fails closed at save with price-mismatch.
   * Returns { ok, rows, totalCents, nights, roomCents, mealCents } or
   * { ok:false, missing:['room'|'meal'|'dates'] }. */
  /* Birth dates are typed, not picked: native date inputs render in the
   * browser UI locale (mm/dd/yyyy on an English browser) no matter the page
   * language, while receptionists type JJ/MM/AAAA. Stored ISO stays the
   * single persisted shape; these convert at the editor edges. */
  function cuBirthDisplay(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
  }
  function cuBirthIso() { return hotelSection('views').cuBirthIso.apply(this, arguments); }
