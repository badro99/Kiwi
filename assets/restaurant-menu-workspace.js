/* Kiwi · restaurant menu workspace. Preview layout, production data only. */
(function () {
  'use strict';
  let tab='menu', filter='all', subFilter=null, query='', hoursPeriod=null, openItemMenu=null; // subFilter : sous-catégorie active ('__none' = non classés)
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=(s)=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cash=(n)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(+n||0)+' MAD';
  const venue=()=>window.KiwiVenue?.getCurrentVenueData?.()?.id||window.KiwiVenue?.getVenue?.()||null;
  const isRestaurant=()=>{const KV=window.KiwiVenue,v=KV?.getCurrentVenueData?.()||{},t=String(KV?.getVenueType?.()||v.type||v.subtype||'').toLowerCase();return ['restaurant','cafe','café','restauration'].includes(t);};
  const S=()=>window.KiwiMenuStore;
  const D=()=>S()?.data(venue())||{cats:[],items:[],stations:[],opts:[]};
  const find=(key,id)=>(D()[key]||[]).find(x=>x.id===id);
  const cat=(id)=>find('cats',id), item=(id)=>find('items',id), station=(id)=>find('stations',id), group=(id)=>find('opts',id);
  const UI_I18N = {
    en: {
      title: 'Menu & modifiers',
      loading: 'Loading menu…',
      home: 'Home',
      articles: 'items',
      article: 'item',
      sections: 'sections',
      section: 'section',
      tabMenu: 'Menu & modifiers',
      tabStations: 'Kitchen stations',
      tabRecipes: 'Recipes',
      tabPerformance: 'Performance',
      tabHours: 'Peak hours',
      tabAlerts: '86 Alerts',
      tabNfc: 'NFC Tags',
      scanMenu: 'Scan a menu',
      importExcel: 'Import Excel',
      translateMenu: 'Translations',
      tabI18n: 'Translations',
      i18nTitle: 'The menu in everyone’s language',
      i18nHint: 'Kiwi AI translates new or changed entries into French, Arabic and English on its own; the original text is never modified. Edit a cell to correct it: a correction is never overwritten.',
      i18nFill: 'Translate what’s missing',
      i18nRedo: 'Retranslate everything',
      i18nRedoConfirm: 'Retranslate the whole menu?',
      i18nRedoDesc: 'Your manual corrections are kept.',
      i18nOriginal: 'Original',
      i18nSections: 'Sections',
      i18nItems: 'Items',
      i18nOptions: 'Options',
      i18nDesc: 'description',
      i18nStatusOk: 'translated',
      i18nStatusStale: 'outdated',
      i18nStatusMissing: 'missing',
      i18nStatusManual: 'corrected by hand',
      i18nUpToDate: 'All translations are up to date.',
      i18nDone: '{n} translation(s) added.',
      i18nQuota: 'Translation quota reached for today. It will resume later.',
      i18nError: 'Translation unavailable right now. It will retry in a few minutes.',
      i18nDemo: 'Automatic translation is for signed-in merchant accounts.',
      i18nBusy: 'Translating · {n} entries',
      i18nEmpty: 'Add items to translate them.',
      all: 'All',
      allWithCount: 'All · {n}',
      uncategorizedWithCount: 'Uncategorized · {n}',
      addSubCat: '+ Subcategory',
      classifyCount: 'Classify {n} item{s}',
      rename: 'Rename',
      delete: 'Delete',
      withoutSubcat: 'Uncategorized',
      noSection: 'Uncategorized',
      kitchen: 'Kitchen',
      counter: 'Counter',
      stepCount: '{n} course(s)',
      optGroupCount: '{n} option group(s)',
      reuse: 'Reuse',
      formula: 'SET MENU',
      searchPlaceholder: 'Search an item…',
      moveLeft: '← Move left',
      moveRight: 'Move right →',
      renameSection: 'Rename section',
      deleteSection: 'Delete section',
      newSection: '+ New section',
      newItem: '+ New item',
      emptyMenuTitle: 'Your menu is empty',
      emptyMenuDesc: 'Create a section, then add your first item. No demo content will be added.',
      createSectionBtn: 'Create a section',
      noItemMatch: 'No items match your search.',
      modAndOpts: 'Modifiers & options',
      newGroupBtn: '+ New option group',
      noOptGroups: 'No option groups.',
      required: 'Required',
      optional: 'Optional',
      manyChoices: 'Multiple choices',
      oneChoice: 'Single choice',
      usedByCount: 'Used by {n} item(s)',
      noChoices: 'No choices',
      stationsTitle: 'Preparation stations',
      stationsSub: 'One section, one station. All tickets remain visible in the All tab of the KDS.',
      addStation: 'Add station',
      defaultStationFallback: 'Kitchen · receives remainder',
      routingBySection: 'Routing by section',
      defaultRoute: '{name} · default',
      addFirstStation: 'Add your first station.',
      createSectionsForRouting: 'Create sections to configure their routing.',
      recipesTitle: 'Recipes & dish costs',
      recipesSub: 'Define exact quantities to link each sale to stock and calculate margins.',
      recipesCompletedCount: '{done} / {total} recipes completed',
      ingredientCount: '{n} ingredient(s)',
      viewAndEdit: 'View and edit',
      complete: 'Complete',
      costSummaryPortion: '{cost} MAD / portion',
      missingCostOrQty: 'Quantities or costs to complete',
      addItemsFirst: 'Add items first.',
      statusToComplete: 'Incomplete',
      statusCostIncomplete: 'Incomplete cost',
      statusCosted: 'Costed recipe',
      statusCheckStock: 'Check stock',
      statusToMonitor: 'To monitor',
      statusCostCompliant: 'Compliant cost',
      perfTitle: 'Item performance',
      perfSub: 'Popularity, revenue and gross profit · Last 30 days · Real POS data.',
      daysCount: '{n} days',
      noItemsToAnalyze: 'No items to analyze',
      noItemsToAnalyzeDesc: 'Add your dishes in Menu & modifiers. Performance will appear after the first sales.',
      noSalesYet: 'No item sales yet',
      noSalesYetDesc: 'Once the till records detailed receipts, Kiwi will automatically classify dishes.',
      completeRecipesForProfit: 'Complete recipes to view profitability',
      completeRecipesForProfitDesc: 'Sales are received. Dish costs are needed to compare their real profit.',
      analyzedRevenue: 'Analyzed revenue',
      itemsSold: 'items sold',
      grossProfitCalc: 'Calculated gross profit',
      recipesSoldAndCosted: '{n} recipe(s) sold and costed',
      costCoverage: 'Cost coverage',
      costCoverageSub: 'share of revenue with complete recipe',
      grossProfitPerItem: 'Gross profit per item',
      popularityXDays: 'Popularity · sales over {n} days',
      perfDotSizeHint: 'Dot size = revenue',
      perfAxesHint: 'Axes = medians of your own menu',
      perfClickHint: 'Click an item to open its recipe',
      quadStar: 'Stars',
      quadStarHint: 'Popular and profitable',
      quadStarAction: 'Promote',
      quadPlow: 'Plowhorses',
      quadPlowHint: 'Popular, margin needs optimization',
      quadPlowAction: 'Review cost or price',
      quadPuzzle: 'Puzzles',
      quadPuzzleHint: 'Profitable, low order volume',
      quadPuzzleAction: 'Position better',
      quadDog: 'Dogs',
      quadDogHint: 'Low orders and low margin',
      quadDogAction: 'Review',
      matrixLabelStar: 'STARS',
      matrixHintStar: 'Profitable · high volume',
      matrixLabelPlow: 'TO OPTIMIZE',
      matrixHintPlow: 'Popular · low margin',
      matrixLabelPuzzle: 'TO DEVELOP',
      matrixHintPuzzle: 'Profitable · low volume',
      matrixLabelDog: 'TO REVIEW',
      matrixHintDog: 'Low margin & volume',
      legendStar: 'Stars',
      legendPlow: 'To optimize',
      legendPuzzle: 'To develop',
      legendDog: 'To review',
      colItem: 'Item',
      colSold: 'Sold',
      colRevenue: 'Revenue',
      colRevenueDesc: 'revenue',
      colUnitCost: 'Cost / item',
      colProfit: 'Gross profit',
      colProfitDesc: 'gross profit',
      colMargin: 'Margin',
      colMarginDesc: 'margin',
      colReadout: 'Status',
      completeRecipeLink: 'Complete recipe',
      marginMissing: 'Missing margin',
      noSaleRecorded: 'No sales',
      hoursTitle: 'Performance by time of day',
      hoursSub: 'Which items sell when · Last {n} days · Real POS data',
      setHoursPrompt: 'Enter restaurant operating hours',
      setHoursPromptDesc: 'Kiwi generates service moments from saved opening hours. No shifts are invented.',
      noServiceToAnalyze: 'No service to analyze',
      noServiceToAnalyzeDesc: 'Current opening hours do not overlap with morning, lunch, or evening. Check opening hours in Settings.',
      generatedRevenue: 'Revenue generated',
      inPeriod: 'in this time window',
      topItem: 'Top item',
      top10Items: 'Top 10 items · {label}',
      noSalesInPeriod: 'No sales yet in this time window',
      noSalesInPeriodDesc: 'Detailed sales will appear here automatically.',
      itemsWithPeak: 'Items with a peak period',
      peakInsightTag: 'KIWI INSIGHT · {label}',
      peakInsightTitle: '{item} leads this service',
      peakInsightBody: '{qty} unit(s), representing {share}% of items sold during this window. {peakShare}% of its analyzed sales occur during {period}.',
      peakNotableBody: '{share}% of its {total} sales occur during {period} ({hours}).',
      alerts86Title: '86 Alerts',
      alerts86Sub: 'Unavailable items shared with POS and OrderPro.',
      reactivate: 'Reactivate',
      no86Alerts: 'No 86 alerts.',
      unavailableBadge: '86 · unavailable',
      nfcTitle: 'NFC Tags',
      nfcSub: 'Manage the tags that open your OrderPro menu.',
      nfcUnavailable: 'NFC Tags unavailable',
      nfcUnavailableDesc: 'Enable OrderPro for this venue to manage its tags.',
      editSectionTitle: 'Edit section',
      newSectionTitle: 'New section',
      sectionNameLabel: 'Section name',
      sectionNamePlaceholder: 'e.g. Drinks',
      stationLabel: 'Preparation station',
      cancelBtn: 'Cancel',
      saveBtn: 'Save',
      doneBtn: 'Done',
      editItemTitle: 'Edit · {name}',
      newItemTitle: 'New item',
      nameLabel: 'Name',
      priceLabel: 'Price (MAD)',
      sectionLabel: 'Section',
      availabilityLabel: 'Availability',
      availableOpt: 'Available',
      unavailableOpt: '86 · unavailable',
      descLabel: 'Description',
      mediaLabel: 'Photo or video',
      addPhotoBtn: 'Add photo',
      addVideoBtn: 'Add video',
      removeMediaBtn: 'Remove',
      mediaStatusKept: 'Current media preserved.',
      noMediaStatus: 'No media.',
      itemOptionsLabel: 'Options for this item',
      createOptGroupFirst: 'Create an option group first.',
      isFormulaLabel: 'Formula / Set Menu (choice of courses)',
      isFormulaHelp: 'Allows composing a menu with courses (starter, main, drink...) during order entry.',
      formulaTemplatePlaceholder: 'Choose a saved formula…',
      noFormulaTemplates: 'No saved formulas',
      copyTemplateBtn: 'Copy to this item',
      saveTemplateBtn: 'Save this formula as a reusable template',
      addStepBtn: 'Add a course',
      stepTitlePlaceholder: 'Course title (e.g. Drink)',
      minLabel: 'Min',
      maxLabel: 'Max',
      noChoicesInStep: 'No choices in this course.',
      chooseItemPlaceholder: 'Choose an item…',
      addChoiceBtn: 'Add',
      noItemsOnMenuFormulaNotice: 'No items on the menu yet. First create your items (e.g. Espresso, Croissant), then come back to build the formula: choices are selected from the list, never typed by hand.',
      saveAndCreateItemBtn: 'Save and create an item',
      allChosenNotice: 'All menu items are already offered in this course.',
      editGroupTitle: 'Edit option group',
      newGroupTitle: 'New option group',
      groupNameLabel: 'Group name',
      groupNamePlaceholder: 'e.g. Cooking, Side, Size',
      groupTypeLabel: 'Type of choice',
      groupRequiredLabel: 'Requirement',
      groupRequiredOpt: 'Required (at least 1 choice)',
      groupOptionalOpt: 'Optional (customer can skip)',
      choicesLabel: 'Choices',
      addChoicePlaceholder: 'e.g. Rare, Fries, Large',
      addChoiceBtnLabel: 'Add choice',
      extraPricePlaceholder: 'Extra (MAD)',
      newSubcategoryTitle: 'New subcategory',
      subNamePlaceholder: 'Name (e.g. Cookies, Cakes, Classics)',
      renameSubcategoryTitle: 'Rename subcategory',
      newNameLabel: 'New name',
      deleteSubcategoryConfirm: 'Delete « {name} » ?',
      deleteSubcategoryDesc: '{n} item(s) will remain in this section and move to "Uncategorized".',
      deleteCategoryConfirm: 'Delete section « {name} » ?',
      deleteCategoryDesc: 'This section and its {n} item(s) will be permanently deleted.',
      deleteItemConfirm: 'Delete « {name} » ?',
      deleteGroupConfirm: 'Delete « {name} » ?',
      addStationTitle: 'Add a station',
      renameStationTitle: 'Rename station',
      stationNameLabel: 'Station name',
      deleteStationConfirm: 'Delete « {name} » ?',
      stationDefault: 'this station',
      scanUnavailable: 'Scan unavailable',
      reloadPage: 'Reload the page.',
      createSubFirstToast: 'Create a subcategory first',
      useAddSubHelp: 'Use "+ Subcategory".',
      allClassifiedToast: 'All items classified',
      noUnclassifiedItems: 'No items without subcategory.',
      classifyTag: 'CLASSIFICATION',
      classifyTitle: 'Classify items',
      articlesWithoutSub: 'items without subcategory',
      articleWithoutSub: 'item without subcategory',
      classifyInstantSaveNotice: 'Each choice is saved immediately.',
      chooseSelectPlaceholder: 'Choose',
    },
    ar: {
      title: 'القائمة والإضافات',
      loading: 'جارٍ تحميل القائمة…',
      home: 'الرئيسية',
      articles: 'منتجات',
      article: 'منتج',
      sections: 'أقسام',
      section: 'قسم',
      tabMenu: 'القائمة والإضافات',
      tabStations: 'محطات التحضير',
      tabRecipes: 'الوصفات',
      tabPerformance: 'الأداء',
      tabHours: 'ساعات الذروة',
      tabAlerts: 'تنبيهات 86',
      tabNfc: 'رموز NFC',
      scanMenu: 'مسح القائمة',
      importExcel: 'استيراد Excel',
      translateMenu: 'الترجمات',
      tabI18n: 'الترجمات',
      i18nTitle: 'القائمة بلغة كل واحد',
      i18nHint: 'يترجم Kiwi AI المدخلات الجديدة أو المعدلة إلى الفرنسية والعربية والإنجليزية تلقائيا؛ النص الأصلي لا يتغير أبدا. عدّل خانة لتصحيحها: التصحيح لا يُستبدل أبدا.',
      i18nFill: 'ترجمة ما ينقص',
      i18nRedo: 'إعادة ترجمة الكل',
      i18nRedoConfirm: 'إعادة ترجمة القائمة كاملة؟',
      i18nRedoDesc: 'تُحفظ تصحيحاتك اليدوية.',
      i18nOriginal: 'النص الأصلي',
      i18nSections: 'الأقسام',
      i18nItems: 'الأصناف',
      i18nOptions: 'الخيارات',
      i18nDesc: 'الوصف',
      i18nStatusOk: 'مترجم',
      i18nStatusStale: 'للمراجعة',
      i18nStatusMissing: 'ناقص',
      i18nStatusManual: 'مصحح يدويا',
      i18nUpToDate: 'كل الترجمات محدثة.',
      i18nDone: 'تمت إضافة {n} ترجمة.',
      i18nQuota: 'تم بلوغ حصة الترجمة اليوم، ستستأنف لاحقا.',
      i18nError: 'تعذرت الترجمة حاليا، ستتم إعادة المحاولة بعد دقائق.',
      i18nDemo: 'الترجمة التلقائية متاحة لحسابات التجار المتصلة.',
      i18nBusy: 'جارٍ الترجمة · {n} مدخل',
      i18nEmpty: 'أضف أصنافا لترجمتها.',
      all: 'الكل',
      allWithCount: 'الكل · {n}',
      uncategorizedWithCount: 'غير مصنف · {n}',
      addSubCat: '+ تصنيف فرعي',
      classifyCount: 'تصنيف {n} منتج',
      rename: 'إعادة تسمية',
      delete: 'حذف',
      withoutSubcat: 'بدون تصنيف فرعي',
      noSection: 'بدون قسم',
      kitchen: 'المطبخ',
      counter: 'المكتب',
      stepCount: '{n} مرحلة',
      optGroupCount: '{n} مجموعة خيارات',
      reuse: 'إعادة استخدام',
      formula: 'قائمة مجمعة',
      searchPlaceholder: 'البحث عن منتج…',
      moveLeft: '← للأمام',
      moveRight: 'للخلف →',
      renameSection: 'إعادة تسمية القسم',
      deleteSection: 'حذف القسم',
      newSection: '+ قسم جديد',
      newItem: '+ منتج جديد',
      emptyMenuTitle: 'قائمتك فارغة',
      emptyMenuDesc: 'أنشئ قسماً ثم أضف أول منتج. لن يتم إضافة أي محتوى تجريبي.',
      createSectionBtn: 'إنشاء قسم',
      noItemMatch: 'لا توجد منتجات مطابقة.',
      modAndOpts: 'المعدلات والخيارات',
      newGroupBtn: '+ مجموعة خيارات جديدة',
      noOptGroups: 'لا توجد مجموعات خيارات.',
      required: 'إلزامي',
      optional: 'اختياري',
      manyChoices: 'خيارات متعددة',
      oneChoice: 'خيار واحد',
      usedByCount: 'مستخدم في {n} منتج',
      noChoices: 'لا توجد خيارات',
      stationsTitle: 'محطات التحضير',
      stationsSub: 'قسم لكل محطة. تظل جميع التذاكر مرئية في تبويب الكل في شاشة المطبخ.',
      addStation: 'إضافة محطة',
      defaultStationFallback: 'المطبخ · يستقبل الباقي',
      routingBySection: 'التوجيه حسب القسم',
      defaultRoute: '{name} · افتراضي',
      addFirstStation: 'أضف أول محطة تحضير.',
      createSectionsForRouting: 'أنشئ أقساماً لتحديد توجيهها.',
      recipesTitle: 'الوصفات والتكاليف لكل طبق',
      recipesSub: 'حدد الكميات بدقة لربط المبيعات بالمخزون وحساب هوامش الربح.',
      recipesCompletedCount: '{done} / {total} وصفة مكتملة',
      ingredientCount: '{n} مكونات',
      viewAndEdit: 'عرض وتعديل',
      complete: 'استكمال',
      costSummaryPortion: '{cost} MAD / حصة',
      missingCostOrQty: 'بحاجة لتحديد الكميات أو التكاليف',
      addItemsFirst: 'أضف منتجات أولاً.',
      statusToComplete: 'بحاجة للاستكمال',
      statusCostIncomplete: 'تكلفة غير مكتملة',
      statusCosted: 'وصفة مسعرة',
      statusCheckStock: 'فحص المخزون',
      statusToMonitor: 'للمتابعة',
      statusCostCompliant: 'تكلفة مطابقة',
      perfTitle: 'أداء المنتجات',
      perfSub: 'الشعبية، رقم المعاملات والربح الإجمالي · آخر 30 يوماً · بيانات حقيقية من الصندوق.',
      daysCount: '{n} يوماً',
      noItemsToAnalyze: 'لا توجد منتجات للتحليل',
      noItemsToAnalyzeDesc: 'أضف أطباقك في القائمة والإضافات. سيظهر الأداء بعد أولى المبيعات.',
      noSalesYet: 'لا توجد مبيعات بعد لكل منتج',
      noSalesYetDesc: 'بمجرد تسجيل الصندوق للتذاكر المفصلة، يصنف Kiwi الأطباق تلقائياً.',
      completeRecipesForProfit: 'أكمل الوصفات لمعرفة الربحية',
      completeRecipesForProfitDesc: 'تم استلام المبيعات. تنقص تكلفة الأطباق لمقارنة ربحها الفعلي.',
      analyzedRevenue: 'رقم المعاملات المحلل',
      itemsSold: 'منتجات مباعة',
      grossProfitCalc: 'الربح الإجمالي المحسوب',
      recipesSoldAndCosted: '{n} وصفة مباعة ومسعرة',
      costCoverage: 'تغطية التكاليف',
      costCoverageSub: 'نسبة المبيعات ذات الوصفة المكتملة',
      grossProfitPerItem: 'الربح الإجمالي لكل منتج',
      popularityXDays: 'الشعبية · المبيعات خلال {n} يوماً',
      perfDotSizeHint: 'حجم النقطة = رقم المعاملات',
      perfAxesHint: 'المحاور = متوسطات قائمتك الخاصة',
      perfClickHint: 'انقر على منتج لفتح وصفته',
      quadStar: 'نجوم (Stars)',
      quadStarHint: 'شعبية ومربحة',
      quadStarAction: 'إبرازها',
      quadPlow: 'أحصنة الجر (Plowhorses)',
      quadPlowHint: 'شعبية بهامش ربح منخفض',
      quadPlowAction: 'مراجعة السعر أو التكلفة',
      quadPuzzle: 'ألغاز (Puzzles)',
      quadPuzzleHint: 'مربحة قليلة الطلب',
      quadPuzzleAction: 'تحسين الموضع',
      quadDog: 'أعباء (Dogs)',
      quadDogHint: 'طلب ضعيف وهامش منخفض',
      quadDogAction: 'مراجعة',
      matrixLabelStar: 'نجوم (STARS)',
      matrixHintStar: 'مربح · حجم مبيعات قوي',
      matrixLabelPlow: 'للتحسين',
      matrixHintPlow: 'شعبي · هامش ضعيف',
      matrixLabelPuzzle: 'للتطوير',
      matrixHintPuzzle: 'مربح · حجم مبيعات ضعيف',
      matrixLabelDog: 'للمراجعة',
      matrixHintDog: 'هامش وحجم مبيعات ضعيفان',
      legendStar: 'نجوم',
      legendPlow: 'للتحسين',
      legendPuzzle: 'للتطوير',
      legendDog: 'للمراجعة',
      colItem: 'المنتج',
      colSold: 'المباع',
      colRevenue: 'رقم المعاملات',
      colRevenueDesc: 'رقم المعاملات',
      colUnitCost: 'التكلفة / منتج',
      colProfit: 'الربح الإجمالي',
      colProfitDesc: 'ربح إجمالي',
      colMargin: 'الهامش',
      colMarginDesc: 'هامش الربح',
      colReadout: 'الحالة',
      completeRecipeLink: 'استكمال الوصفة',
      marginMissing: 'الهامش غير متوفر',
      noSaleRecorded: 'لا توجد مبيعات',
      hoursTitle: 'الأداء حسب أوقات اليوم',
      hoursSub: 'ما المنتجات التي تباع ومتى · آخر {n} يوماً · بيانات حقيقية من الصندوق',
      setHoursPrompt: 'حدد أوقات عمل المطعم',
      setHoursPromptDesc: 'ينشئ Kiwi فترات اليوم بناءً على الأوقات المسجلة دون اختلاق أي فترة.',
      noServiceToAnalyze: 'لا توجد فترة للتحليل',
      noServiceToAnalyzeDesc: 'أوقات العمل الحالية لا تتقاطع مع الصباح أو الظهيرة أو المساء. تحقق من أوقات العمل في الإعدادات.',
      generatedRevenue: 'المدخول المحقق',
      inPeriod: 'خلال هذه الفترة',
      topItem: 'أفضل منتج',
      top10Items: 'أفضل 10 منتجات · {label}',
      noSalesInPeriod: 'لا توجد مبيعات بعد في هذه الفترة',
      noSalesInPeriodDesc: 'ستظهر المبيعات المفصلة هنا تلقائياً.',
      itemsWithPeak: 'منتجات ذات ذروة طلب',
      peakInsightTag: 'تحليل KIWI · {label}',
      peakInsightTitle: '{item} يقود هذه الفترة',
      peakInsightBody: '{qty} وحدة، أي ما يمثل {share}% من المنتجات المباعة خلال هذه الفترة. {peakShare}% من مبيعاته تتم خلال {period}.',
      peakNotableBody: '{share}% من مبيعاته البالغة {total} تتم خلال {period} ({hours}).',
      alerts86Title: 'تنبيهات 86',
      alerts86Sub: 'المنتجات غير المتاحة المشتركة مع الصندوق و OrderPro.',
      reactivate: 'إعادة تفعيل',
      no86Alerts: 'لا توجد تنبيهات 86.',
      unavailableBadge: '86 · غير متاح',
      nfcTitle: 'رموز NFC',
      nfcSub: 'إدارة الرموز التي تفتح قائمة OrderPro.',
      nfcUnavailable: 'رموز NFC غير متاحة',
      nfcUnavailableDesc: 'قم بتفعيل OrderPro لهذا المتجر لإدارة رموزه.',
      editSectionTitle: 'تعديل القسم',
      newSectionTitle: 'قسم جديد',
      sectionNameLabel: 'اسم القسم',
      sectionNamePlaceholder: 'مثال: مشروبات',
      stationLabel: 'محطة التحضير',
      cancelBtn: 'إلغاء',
      saveBtn: 'حفظ',
      doneBtn: 'تم',
      editItemTitle: 'تعديل · {name}',
      newItemTitle: 'منتج جديد',
      nameLabel: 'الاسم',
      priceLabel: 'السعر (MAD)',
      sectionLabel: 'القسم',
      availabilityLabel: 'التوفر',
      availableOpt: 'متاح',
      unavailableOpt: '86 · غير متاح',
      descLabel: 'الوصف',
      mediaLabel: 'صورة أو فيديو',
      addPhotoBtn: 'إضافة صورة',
      addVideoBtn: 'إضافة فيديو',
      removeMediaBtn: 'إزالة',
      mediaStatusKept: 'تم الاحتفاظ بالوسائط الحالية.',
      noMediaStatus: 'لا توجد وسائط.',
      itemOptionsLabel: 'خيارات هذا المنتج',
      createOptGroupFirst: 'أنشئ أولاً مجموعة خيارات.',
      isFormulaLabel: 'قائمة مجمعة / وجبة مركبة (مراحل للاختيار)',
      isFormulaHelp: 'تتيح تكوين قائمة ذات مراحل (مقبلات، طبق رئيسي، مشروب...) عند تسجيل الطلب.',
      formulaTemplatePlaceholder: 'اختر نموذجاً مسجلاً…',
      noFormulaTemplates: 'لا توجد نماذج مسجلة',
      copyTemplateBtn: 'نسخ إلى هذا المنتج',
      saveTemplateBtn: 'حفظ هذه القائمة كنموذج قابل لإعادة الاستخدام',
      addStepBtn: 'إضافة مرحلة',
      stepTitlePlaceholder: 'عنوان المرحلة (مثال: المشروب)',
      minLabel: 'الحد الأدنى',
      maxLabel: 'الحد الأقصى',
      noChoicesInStep: 'لا توجد خيارات في هذه المرحلة.',
      chooseItemPlaceholder: 'اختر منتجاً…',
      addChoiceBtn: 'إضافة',
      noItemsOnMenuFormulaNotice: 'لا توجد منتجات في القائمة بعد. أنشئ منتجاتك أولاً ثم عد لتركيب الوجبة المركبة.',
      saveAndCreateItemBtn: 'حفظ وإنشاء منتج',
      allChosenNotice: 'جميع منتجات القائمة معروضة بالفعل في هذه المرحلة.',
      editGroupTitle: 'تعديل مجموعة الخيارات',
      newGroupTitle: 'مجموعة خيارات جديدة',
      groupNameLabel: 'اسم المجموعة',
      groupNamePlaceholder: 'مثال: درجة الطهي، الإضافة، الحجم',
      groupTypeLabel: 'نوع الاختيار',
      groupRequiredLabel: 'الإلزامية',
      groupRequiredOpt: 'إلزامي (خيار واحد على الأقل)',
      groupOptionalOpt: 'اختياري (يمكن تجاوزه)',
      choicesLabel: 'الخيارات',
      addChoicePlaceholder: 'مثال: مطهو جيداً، بطاطس، كبير',
      addChoiceBtnLabel: 'إضافة خيار',
      extraPricePlaceholder: 'سعر إضافي (MAD)',
      newSubcategoryTitle: 'تصنيف فرعي جديد',
      subNamePlaceholder: 'الاسم (مثال: كوكيز، كيك، كلاسيكيات)',
      renameSubcategoryTitle: 'إعادة تسمية التصنيف الفرعي',
      newNameLabel: 'الاسم الجديد',
      deleteSubcategoryConfirm: 'حذف « {name} » ؟',
      deleteSubcategoryDesc: 'سيبقى {n} منتج في هذا القسم وسينتقل إلى "غير مصنف".',
      deleteCategoryConfirm: 'حذف قسم « {name} » ؟',
      deleteCategoryDesc: 'سيتم حذف هذا القسم ومنتجاته البالغ عددها {n} نهائياً.',
      deleteItemConfirm: 'حذف « {name} » ؟',
      deleteGroupConfirm: 'حذف « {name} » ؟',
      addStationTitle: 'إضافة محطة تحضير',
      renameStationTitle: 'إعادة تسمية المحطة',
      stationNameLabel: 'اسم المحطة',
      deleteStationConfirm: 'حذف « {name} » ؟',
      stationDefault: 'هذه المحطة',
      scanUnavailable: 'المسح غير متوفر',
      reloadPage: 'أعد تحميل الصفحة.',
      createSubFirstToast: 'أنشئ فئة فرعية أولاً',
      useAddSubHelp: 'استخدم « + تصنيف فرعي ».',
      allClassifiedToast: 'تم تصنيف كل المنتجات',
      noUnclassifiedItems: 'لا توجد منتجات بدون تصنيف فرعي.',
      classifyTag: 'تصنيف',
      classifyTitle: 'تصنيف المنتجات',
      articlesWithoutSub: 'منتجات بدون تصنيف فرعي',
      articleWithoutSub: 'منتج بدون تصنيف فرعي',
      classifyInstantSaveNotice: 'يتم حفظ كل اختيار فوراً.',
      chooseSelectPlaceholder: 'اختيار',
    },
    fr: {
      title: 'Menu & modificateurs',
      loading: 'Chargement du menu…',
      home: 'Accueil',
      articles: 'articles',
      article: 'article',
      sections: 'sections',
      section: 'section',
      tabMenu: 'Menu & modificateurs',
      tabStations: 'Postes de préparation',
      tabRecipes: 'Recettes',
      tabPerformance: 'Performance',
      tabHours: 'Heures de pointe',
      tabAlerts: 'Alertes 86',
      tabNfc: 'Tags NFC',
      scanMenu: 'Scanner un menu',
      importExcel: 'Importer Excel',
      translateMenu: 'Traductions',
      tabI18n: 'Traductions',
      i18nTitle: 'La carte dans la langue de chacun',
      i18nHint: 'Kiwi AI traduit de lui-même les nouveautés et les modifications en français, arabe et anglais ; le texte d’origine n’est jamais modifié. Corrigez une cellule pour la reprendre : une correction n’est plus jamais écrasée.',
      i18nFill: 'Traduire ce qui manque',
      i18nRedo: 'Tout retraduire',
      i18nRedoConfirm: 'Retraduire toute la carte ?',
      i18nRedoDesc: 'Vos corrections manuelles sont conservées.',
      i18nOriginal: 'Texte d’origine',
      i18nSections: 'Sections',
      i18nItems: 'Articles',
      i18nOptions: 'Options',
      i18nDesc: 'description',
      i18nStatusOk: 'traduits',
      i18nStatusStale: 'à revoir',
      i18nStatusMissing: 'manquants',
      i18nStatusManual: 'corrigé à la main',
      i18nUpToDate: 'Toutes les traductions sont à jour.',
      i18nDone: '{n} traduction(s) ajoutée(s).',
      i18nQuota: 'Quota de traduction atteint pour aujourd’hui. Reprise automatique plus tard.',
      i18nError: 'Traduction impossible pour le moment. Nouvel essai automatique dans quelques minutes.',
      i18nDemo: 'Les traductions automatiques sont réservées aux comptes commerçants connectés.',
      i18nBusy: 'Traduction en cours · {n} entrée(s)',
      i18nEmpty: 'Ajoutez des articles pour les traduire.',
      all: 'Tous',
      allWithCount: 'Tout · {n}',
      uncategorizedWithCount: 'À classer · {n}',
      addSubCat: '+ Sous-catégorie',
      classifyCount: 'Classer {n} article{s}',
      rename: 'Renommer',
      delete: 'Supprimer',
      withoutSubcat: 'Sans sous-catégorie',
      noSection: 'Sans section',
      kitchen: 'Cuisine',
      counter: 'Comptoir',
      stepCount: '{n} étape(s)',
      optGroupCount: '{n} groupe(s) d’options',
      reuse: 'Réutiliser',
      formula: 'FORMULE',
      searchPlaceholder: 'Rechercher un article…',
      moveLeft: '← Avant',
      moveRight: 'Après →',
      renameSection: 'Renommer la section',
      deleteSection: 'Supprimer la section',
      newSection: '+ Nouvelle section',
      newItem: '+ Nouvel article',
      emptyMenuTitle: 'Votre menu est vide',
      emptyMenuDesc: 'Créez une section, puis ajoutez votre premier article. Aucun contenu de démonstration ne sera ajouté.',
      createSectionBtn: 'Créer une section',
      noItemMatch: 'Aucun article ne correspond.',
      modAndOpts: 'Modificateurs & options',
      newGroupBtn: '+ Nouveau groupe d’options',
      noOptGroups: 'Aucun groupe d’options.',
      required: 'Obligatoire',
      optional: 'Optionnel',
      manyChoices: 'Plusieurs choix',
      oneChoice: 'Un seul choix',
      usedByCount: 'Utilisé par {n} article(s)',
      noChoices: 'Aucun choix',
      stationsTitle: 'Postes de préparation',
      stationsSub: 'Une section, un poste. Tous les tickets restent visibles dans l’onglet Toutes du KDS.',
      addStation: 'Ajouter un poste',
      defaultStationFallback: 'Cuisine · reçoit le reste',
      routingBySection: 'Routage par section',
      defaultRoute: '{name} · par défaut',
      addFirstStation: 'Ajoutez votre premier poste.',
      createSectionsForRouting: 'Créez des sections pour définir leur routage.',
      recipesTitle: 'Recettes & coûts par plat',
      recipesSub: 'Définissez les quantités exactes pour relier chaque vente au stock et calculer vos marges.',
      recipesCompletedCount: '{done} / {total} recettes complétées',
      ingredientCount: '{n} ingrédient(s)',
      viewAndEdit: 'Voir et modifier',
      complete: 'Compléter',
      costSummaryPortion: '{cost} MAD / portion',
      missingCostOrQty: 'Quantités ou coûts à compléter',
      addItemsFirst: 'Ajoutez d’abord des articles.',
      statusToComplete: 'À compléter',
      statusCostIncomplete: 'Coût incomplet',
      statusCosted: 'Recette chiffrée',
      statusCheckStock: 'Stock à vérifier',
      statusToMonitor: 'À surveiller',
      statusCostCompliant: 'Coût conforme',
      perfTitle: 'Performance des articles',
      perfSub: 'Popularité, chiffre d’affaires et profit brut · 30 derniers jours · données réelles de la caisse.',
      daysCount: '{n} jours',
      noItemsToAnalyze: 'Aucun article à analyser',
      noItemsToAnalyzeDesc: 'Ajoutez vos plats dans Menu & modificateurs. Les performances apparaîtront après les premières ventes.',
      noSalesYet: 'Pas encore de ventes par article',
      noSalesYetDesc: 'Dès que la caisse enregistre des tickets détaillés, Kiwi classe automatiquement les plats.',
      completeRecipesForProfit: 'Complétez les recettes pour voir la rentabilité',
      completeRecipesForProfitDesc: 'Les ventes sont bien reçues. Il manque le coût de chaque plat pour comparer leur profit réel.',
      analyzedRevenue: 'Chiffre d’affaires analysé',
      itemsSold: 'articles vendus',
      grossProfitCalc: 'Profit brut calculé',
      recipesSoldAndCosted: '{n} recette(s) vendue(s) et chiffrée(s)',
      costCoverage: 'Couverture des coûts',
      costCoverageSub: 'part du CA avec recette complète',
      grossProfitPerItem: 'Profit brut par article',
      popularityXDays: 'Popularité · ventes sur {n} jours',
      perfDotSizeHint: 'Taille du point = chiffre d’affaires',
      perfAxesHint: 'Axes = médianes de votre propre carte',
      perfClickHint: 'Cliquez sur un article pour ouvrir sa recette',
      quadStar: 'Stars',
      quadStarHint: 'Populaires et rentables',
      quadStarAction: 'À mettre en avant',
      quadPlow: 'Plowhorses',
      quadPlowHint: 'Populaires, marge à optimiser',
      quadPlowAction: 'Revoir coût ou prix',
      quadPuzzle: 'Puzzles',
      quadPuzzleHint: 'Rentables, peu commandés',
      quadPuzzleAction: 'Mieux les positionner',
      quadDog: 'Dogs',
      quadDogHint: 'Peu commandés et faible marge',
      quadDogAction: 'À revoir',
      matrixLabelStar: 'STARS',
      matrixHintStar: 'Rentable · volume fort',
      matrixLabelPlow: 'À OPTIMISER',
      matrixHintPlow: 'Populaire · marge faible',
      matrixLabelPuzzle: 'À DÉVELOPPER',
      matrixHintPuzzle: 'Rentable · volume faible',
      matrixLabelDog: 'À REVOIR',
      matrixHintDog: 'Marge et volume faibles',
      legendStar: 'Stars',
      legendPlow: 'À optimiser',
      legendPuzzle: 'À développer',
      legendDog: 'À revoir',
      colItem: 'Article',
      colSold: 'Vendus',
      colRevenue: 'Chiffre d’affaires',
      colRevenueDesc: 'de CA',
      colUnitCost: 'Coût / article',
      colProfit: 'Profit brut',
      colProfitDesc: 'de profit brut',
      colMargin: 'Marge',
      colMarginDesc: 'de marge',
      colReadout: 'Lecture',
      completeRecipeLink: 'Compléter la recette',
      marginMissing: 'Marge manquante',
      noSaleRecorded: 'Aucune vente',
      hoursTitle: 'Performance par moment de la journée',
      hoursSub: 'Quels articles se vendent quand · {n} derniers jours · données réelles de la caisse',
      setHoursPrompt: 'Renseignez les horaires du restaurant',
      setHoursPromptDesc: 'Kiwi crée les moments de la journée à partir des horaires enregistrés. Aucun créneau n’est inventé.',
      noServiceToAnalyze: 'Aucun service à analyser',
      noServiceToAnalyzeDesc: 'Les horaires actuels ne croisent ni le matin, ni le midi, ni le soir. Vérifiez les horaires du restaurant dans Réglages.',
      generatedRevenue: 'CA généré',
      inPeriod: 'sur le créneau',
      topItem: 'Top article',
      top10Items: 'Top 10 articles · {label}',
      noSalesInPeriod: 'Pas encore de ventes sur ce créneau',
      noSalesInPeriodDesc: 'Les ventes détaillées apparaîtront ici automatiquement.',
      itemsWithPeak: 'Articles avec un moment fort',
      peakInsightTag: 'LECTURE KIWI · {label}',
      peakInsightTitle: '{item} porte ce service',
      peakInsightBody: '{qty} unité(s), soit {share} % des articles vendus sur ce créneau. {peakShare} % de ses ventes analysées ont lieu pendant {period}.',
      peakNotableBody: '{share} % de ses {total} ventes ont lieu pendant {period} ({hours}).',
      alerts86Title: 'Alertes 86',
      alerts86Sub: 'Indisponibilités partagées avec la caisse et OrderPro.',
      reactivate: 'Réactiver',
      no86Alerts: 'Aucune alerte 86.',
      unavailableBadge: '86 · indisponible',
      nfcTitle: 'Tags NFC',
      nfcSub: 'Gérez les tags qui ouvrent votre menu OrderPro.',
      nfcUnavailable: 'Tags NFC indisponibles',
      nfcUnavailableDesc: 'Activez OrderPro pour cet établissement afin de gérer ses tags.',
      editSectionTitle: 'Modifier la section',
      newSectionTitle: 'Nouvelle section',
      sectionNameLabel: 'Nom de la section',
      sectionNamePlaceholder: 'ex. Boissons',
      stationLabel: 'Poste de préparation',
      cancelBtn: 'Annuler',
      saveBtn: 'Enregistrer',
      doneBtn: 'Terminé',
      editItemTitle: 'Modifier · {name}',
      newItemTitle: 'Nouvel article',
      nameLabel: 'Nom',
      priceLabel: 'Prix (MAD)',
      sectionLabel: 'Section',
      availabilityLabel: 'Disponibilité',
      availableOpt: 'Disponible',
      unavailableOpt: '86 · indisponible',
      descLabel: 'Description',
      mediaLabel: 'Photo ou vidéo',
      addPhotoBtn: 'Ajouter une photo',
      addVideoBtn: 'Ajouter une vidéo',
      removeMediaBtn: 'Retirer',
      mediaStatusKept: 'Média actuel conservé.',
      noMediaStatus: 'Aucun média.',
      itemOptionsLabel: 'Options de cet article',
      createOptGroupFirst: 'Créez d’abord un groupe d’options.',
      isFormulaLabel: 'Formule / menu composé (étapes au choix)',
      isFormulaHelp: 'Permet de composer un menu avec étapes (entrée, plat, boisson...) lors de la prise de commande.',
      formulaTemplatePlaceholder: 'Choisir une formule déjà enregistrée…',
      noFormulaTemplates: 'Aucune formule enregistrée',
      copyTemplateBtn: 'Copier dans cet article',
      saveTemplateBtn: 'Enregistrer cette formule comme modèle réutilisable',
      addStepBtn: 'Ajouter une étape',
      stepTitlePlaceholder: 'Titre de l\'étape (ex. La boisson)',
      minLabel: 'Min',
      maxLabel: 'Max',
      noChoicesInStep: 'Aucun choix dans cette étape.',
      chooseItemPlaceholder: 'Choisir un article…',
      addChoiceBtn: 'Ajouter',
      noItemsOnMenuFormulaNotice: 'Aucun produit sur la carte pour l\'instant. Créez d\'abord vos produits (ex. Café noir, Croissant), puis revenez composer la formule : les choix se sélectionnent dans la liste, jamais à la main.',
      saveAndCreateItemBtn: 'Enregistrer et créer un produit',
      allChosenNotice: 'Tous les produits de la carte sont déjà proposés dans cette étape.',
      editGroupTitle: 'Modifier le groupe d’options',
      newGroupTitle: 'Nouveau groupe d’options',
      groupNameLabel: 'Nom du groupe',
      groupNamePlaceholder: 'ex. Cuisson, Accompagnement, Taille',
      groupTypeLabel: 'Type de choix',
      groupRequiredLabel: 'Obligation',
      groupRequiredOpt: 'Obligatoire (au moins 1 choix)',
      groupOptionalOpt: 'Optionnel (le client peut ignorer)',
      choicesLabel: 'Choix proposés',
      addChoicePlaceholder: 'ex. Saignant, Frites, Grand',
      addChoiceBtnLabel: 'Ajouter le choix',
      extraPricePlaceholder: 'Supplément (MAD)',
      newSubcategoryTitle: 'Nouvelle sous-catégorie',
      subNamePlaceholder: 'Nom (ex. Cookies, Gâteaux, Classics)',
      renameSubcategoryTitle: 'Renommer la sous-catégorie',
      newNameLabel: 'Nouveau nom',
      deleteSubcategoryConfirm: 'Supprimer « {name} » ?',
      deleteSubcategoryDesc: '{n} article(s) resteront dans la section et passeront dans « À classer ».',
      deleteCategoryConfirm: 'Supprimer la section « {name} » ?',
      deleteCategoryDesc: 'Cette section et ses {n} article(s) seront supprimés définitivement.',
      deleteItemConfirm: 'Supprimer « {name} » ?',
      deleteGroupConfirm: 'Supprimer « {name} » ?',
      addStationTitle: 'Ajouter un poste',
      renameStationTitle: 'Renommer le poste',
      stationNameLabel: 'Nom du poste',
      deleteStationConfirm: 'Supprimer « {name} » ?',
      stationDefault: 'ce poste',
      scanUnavailable: 'Scan indisponible',
      reloadPage: 'Rechargez la page.',
      createSubFirstToast: 'Créez d’abord une sous-catégorie',
      useAddSubHelp: 'Utilisez « + Sous-catégorie ».',
      allClassifiedToast: 'Tout est classé',
      noUnclassifiedItems: 'Aucun article sans sous-catégorie.',
      classifyTag: 'CLASSEMENT',
      classifyTitle: 'Classer les articles',
      articlesWithoutSub: 'articles sans sous-catégorie',
      articleWithoutSub: 'article sans sous-catégorie',
      classifyInstantSaveNotice: 'Chaque choix est enregistré immédiatement.',
      chooseSelectPlaceholder: 'Choisir',
    }
  };

  const lang=()=>{
    try{
      return (window.KiwiI18n?.getLang?.())||(window.KiwiMenuI18n?.lang?.())||(typeof localStorage!=='undefined'?localStorage.getItem('kiwiLang'):'')||'fr';
    }catch(_){return 'fr';}
  };
  function ui(key, params) {
    const l = lang();
    let text = (UI_I18N[l] && UI_I18N[l][key]) || (UI_I18N.fr && UI_I18N.fr[key]) || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
    }
    return text;
  }
  const t=(str)=>window.KiwiMenuI18n?window.KiwiMenuI18n.t(str,lang()):str;
  const icons={menu:'menu',languages:'languages',station:'cooking-pot',book:'book-open',chart:'bar-chart-3',clock:'clock',alert:'alert-triangle',tag:'tag',plus:'plus',edit:'pencil',trash:'trash-2',archive:'archive',restore:'archive-restore',more:'more-vertical'};
  const ic=(n)=>`<i data-lucide="${icons[n]||icons.menu}" style="width:14px;height:14px" aria-hidden="true"></i>`;
  const pickerSearchIcon='<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/></svg>';
  const pickerChevronIcon='<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-360 280-560l56-56 144 144 144-144 56 56-200 200Z"/></svg>';
  const toast=(t,d,type='success')=>window.Kiwi?.toast?.(t,{desc:d||'',type});
  function tabs(){
    const n=D().items.filter(x=>x.avail===false).length;
    return [
      ['menu', ui('tabMenu'), 'menu'],
      ['i18n', ui('tabI18n'), 'languages'],
      ['stations', ui('tabStations'), 'station'],
      ['recipes', ui('tabRecipes'), 'book'],
      ['performance', ui('tabPerformance'), 'chart'],
      ['hours', ui('tabHours'), 'clock'],
      ['alerts', ui('tabAlerts'), 'alert'],
      ['nfc', ui('tabNfc'), 'tag']
    ].map(([id,l,i])=>`<button class="mi-pill${tab===id?' on':''}" data-action="rmw-tab" data-tab="${id}">${ic(i)}<span>${esc(l)}</span>${id==='alerts'&&n?`<span class="mi-tab-badge">${n}</span>`:''}</button>`).join('');
  }
  let readyTimer=0,readyTries=0;
  function show(forceRestaurantRoute=false){
    if(!forceRestaurantRoute&&!isRestaurant())return false;
    window.Kiwi?.pageShell?.('menu');document.body.classList.add('page-menu');$$('.sidebar nav a').forEach(a=>a.classList.toggle('active',a.dataset.nav==='menu'));const bc=$('.breadcrumb');if(bc)bc.innerHTML=`${esc(ui('home'))} <span class="sep">/</span> <b>${esc(ui('title'))}</b>`;
    const root=$('[data-menu-root]');if(root)root.hidden=false;
    if(!S()||!isRestaurant()){
      if(root)root.innerHTML=`<div class="mi-head"><div><div class="mi-title">${esc(ui('title'))}</div><div class="mi-sub">${esc(ui('loading'))}</div></div></div>`;
      clearTimeout(readyTimer);
      if(readyTries++>100){readyTries=0;if(!isRestaurant()&&legacyMenuHandler){legacyMenuHandler();}return true;}
      readyTimer=setTimeout(()=>{if(document.body.classList.contains('page-menu'))show(true);},50);
      return true;
    }
    clearTimeout(readyTimer);readyTries=0;render();return true;
  }
  function render(){
    if(!isRestaurant())return;
    const root=$('[data-menu-root]');if(!root)return;
    const d=D(),v=window.KiwiVenue?.getCurrentVenueData?.()||{};
    root.hidden=false;
    const itemCountStr = d.items.length === 1 ? `1 ${ui('article')}` : `${d.items.length} ${ui('articles')}`;
    const catCountStr = d.cats.length === 1 ? `1 ${ui('section')}` : `${d.cats.length} ${ui('sections')}`;
    root.innerHTML=`<div class="mi-head"><div><div class="mi-title">${esc(ui('title'))}</div><div class="mi-sub">${itemCountStr} · ${catCountStr} · ${esc(v.name||'')}</div></div><div class="mi-head-acts"><button class="btn-slim" data-action="rmw-menu-scan">${esc(ui('scanMenu'))}</button><button class="btn-slim" data-action="mx-import">${esc(ui('importExcel'))}</button></div></div><div class="mi-filters"><div class="mi-pill-row">${tabs()}</div></div><div class="mi-panel" data-rmw-panel>${panel()}</div>`;
    if(tab==='nfc')window.KiwiOrderProPanel?.mount?.($('[data-rmw-nfc]',root));
  }
  function panel(){return ({i18n:i18nPanel,stations:stationsPanel,recipes:recipesPanel,performance:performancePanel,hours:hoursPanel,alerts:alertsPanel,nfc:nfcPanel}[tab]||menuPanel)();}
  function shownItems(){const q=query.trim().toLowerCase();return D().items.filter(x=>(filter==='all'||x.catId===filter)&&(filter==='all'||!subFilter||(subFilter==='__none'?!x.subId:x.subId===subFilter))&&(!q||`${t(x.name)} ${x.name} ${x.desc||''}`.toLowerCase().includes(q)));}
  const subsOf=(cid)=>cat(cid)?.sub||[];
  function subChips(){
    if(filter==='all')return '';
    const subs=subsOf(filter),all=D().items.filter(x=>x.catId===filter);
    const none=all.filter(x=>!x.subId).length;
    const chip=(id,l,on)=>`<button class="mi-subchip${on?' on':''}" data-action="rmw-sub-filter" data-sub="${id}">${l}</button>`;
    let h=chip('',ui('allWithCount', { n: all.length }),!subFilter)+subs.map(s=>chip(s.id,`${esc(t(s.name))} · ${all.filter(x=>x.subId===s.id).length}`,subFilter===s.id)).join('');
    if(subs.length&&none)h+=chip('__none',ui('uncategorizedWithCount', { n: none }),subFilter==='__none');
    h+=`<button class="mi-subchip add" data-action="rmw-sub-add" data-arg="${filter}">${esc(ui('addSubCat'))}</button>`;
    if(subs.length&&none)h+=`<button class="mi-subchip add" data-action="rmw-classify" data-arg="${filter}">${ic('edit')} ${esc(ui('classifyCount', { n: none, s: none > 1 ? 's' : '' }))}</button>`;
    if(subFilter&&subFilter!=='__none'&&subs.some(s=>s.id===subFilter)){
      h+=`<button class="mi-subchip add" data-action="rmw-sub-rename" data-arg="${filter}::${subFilter}">${ic('edit')} ${esc(ui('rename'))}</button><button class="mi-subchip add danger" data-action="rmw-sub-delete" data-arg="${filter}::${subFilter}">${ic('trash')} ${esc(ui('delete'))}</button>`;
    }
    return `<div class="mi-subchips">${h}</div>`;
  }
  function gridHtml(list){
    const flat=()=>`<div class="mi-grid">${list.map(card).join('')}</div>`;
    if(filter==='all'||subFilter||query.trim())return flat();
    const subs=subsOf(filter);
    if(!subs.length)return flat();
    const groups=subs.map(s=>({id:s.id,label:t(s.name),items:list.filter(x=>x.subId===s.id)})).filter(g=>g.items.length);
    const rest=list.filter(x=>!x.subId||!subs.some(s=>s.id===x.subId));
    if(rest.length)groups.push({id:'__none',label:ui('withoutSubcat'),items:rest,muted:true});
    if(groups.length<2)return flat();
    return groups.map(g=>`<div class="mi-sub-head${g.muted?' muted':''}" data-action="rmw-sub-filter" data-sub="${g.id}" role="button" tabindex="0"><span>${esc(g.label)}</span><small>${g.items.length} ${esc(g.items.length>1?ui('articles'):ui('article'))}</small></div><div class="mi-grid">${g.items.map(card).join('')}</div>`).join('');
  }
  function openClassify(cid){
    const subs=subsOf(cid);
    if(!subs.length){toast(ui('createSubFirstToast'),ui('useAddSubHelp'),'info');return;}
    const pending=D().items.filter(x=>x.catId===cid&&!x.subId);
    if(!pending.length){toast(ui('allClassifiedToast'),ui('noUnclassifiedItems'),'info');return;}
    const opts=subs.map(s=>`<option value="${s.id}">${esc(t(s.name))}</option>`).join('');
    const helpPending = pending.length > 1 ? `${pending.length} ${ui('articlesWithoutSub')}` : `1 ${ui('articleWithoutSub')}`;
    const m=modal({tag:ui('classifyTag'),title:`${esc(ui('classifyTitle'))} · ${esc(t(cat(cid)?.name)||'')}`,width:560,body:`<div class="kf-help" style="margin-bottom:10px;">${helpPending}. ${esc(ui('classifyInstantSaveNotice'))}</div><div class="mi-classify-list">${pending.map(x=>`<div class="mi-classify-row" data-mcr="${x.id}"><span class="mi-classify-name">${esc(t(x.name))}</span><select class="kf-input" data-rmw-classify-sub="${x.id}"><option value="">· ${esc(ui('chooseSelectPlaceholder'))} ·</option>${opts}</select></div>`).join('')}</div>`,foot:`<button class="eq-cta-gradient" data-done>${esc(ui('doneBtn'))}</button>`});
    m.el.addEventListener('change',e=>{const sel=e.target.closest('[data-rmw-classify-sub]');if(!sel||!sel.value)return;S().updateItem(sel.dataset.rmwClassifySub,{subId:sel.value});sel.closest('[data-mcr]')?.classList.add('done');});
    $('[data-done]',m.el).onclick=()=>{m.close();render();};
  }
  function card(x){
    const tr=(typeof t==='function'?t:(s)=>s);
    const u=(typeof ui==='function'?ui:(k,p)=>k==='formula'?'FORMULE':k==='stepCount'?`${p?.n||0} étape(s)`:k==='optGroupCount'?`${p?.n||0} groupe(s) d’options`:k==='noSection'?'Sans section':k==='reuse'?'Réutiliser':k);
    const c=cat(x.catId),sid=c?.station||S().kitchenId(venue()),s=station(sid),sub=c&&x.subId?(c.sub||[]).find(k=>k.id===x.subId):null;
    const media=x.video?`<video class="rmw-media" src="${esc(x.video)}" muted playsinline preload="metadata"></video>`:x.photo?`<img class="rmw-media" src="${esc(x.photo)}" alt=""/>`:'';
    const formulaBadge=x.formula?`<span class="mi-tag" style="background:var(--mint-tint);color:var(--forest-ink);font-weight:700;margin-left:4px;">${esc(u('formula'))}</span>`:'';
    const cName=tr(c?.name)||u('noSection');
    const subName=sub?tr(sub.name):'';
    const xName=tr(x.name);
    const sName=tr(s?.name||'Cuisine');
    const stateUi=(key,fallback)=>(typeof ui==='function'?ui(key):fallback);const badges=[x.formulaOnly?stateUi('formulaOnly','Réservé aux formules'):'',x.archived?stateUi('archived','Archivé'):'',x.avail===false?'86':''].filter(Boolean).map(label=>`<span class="mi-tag">${esc(label)}</span>`).join('');
    const menuOpen = typeof openItemMenu !== 'undefined' && openItemMenu === x.id;
    const actionMenu=`<span class="rmw-card-menu" data-rmw-menu-root><button class="rmw-more-btn" data-action="rmw-item-more" data-arg="${x.id}" aria-label="${esc(stateUi('more','Plus d’actions'))}" title="${esc(stateUi('more','Plus d’actions'))}" aria-haspopup="menu" aria-expanded="${menuOpen}">${ic('more')}</button>${menuOpen?`<span class="rmw-action-pop" role="menu">${x.formula?`<button data-action="rmw-formula-duplicate" data-arg="${x.id}" role="menuitem">${ic('plus')}<span>${esc(stateUi('reuse','Réutiliser'))}</span></button>`:''}<button data-action="rmw-item-archive" data-arg="${x.id}" role="menuitem">${ic(x.archived?'restore':'archive')}<span>${esc(archiveLabel)}</span></button><button class="danger" data-action="rmw-item-delete" data-arg="${x.id}" role="menuitem">${ic('trash')}<span>${esc(stateUi('delete','Supprimer'))}</span></button></span>`:''}</span>`;
    return `<article class="mi-card${x.avail===false?' rmw-off':''}${x.archived?' rmw-archived':''}${menuOpen?' rmw-menu-open':''}"><button type="button" class="rmw-card-edit-hit" data-action="rmw-item-edit" data-arg="${x.id}" aria-label="${esc(ui('editItemTitle',{name:xName}))}"></button>${media}<div class="mi-card-top"><span class="mi-card-cat" title="${esc(cName+(subName?` · ${subName}`:''))}">${esc(subName||cName)}</span>${formulaBadge}${badges}${actionMenu}</div><div class="mi-card-name">${esc(xName)}</div><div class="mi-card-price-row"><span class="mi-card-price">${cash(x.price)}</span><span class="mi-card-station">→ ${esc(sName)}</span></div><div class="mi-card-foot"><span>${x.formula?`${(x.formula.slots||[]).length} étape(s)`:`${(x.opts||[]).length} groupe(s) d’options`}</span><span class="mi-card-acts"><button class="mi-state-toggle" data-action="rmw-item-avail" data-arg="${x.id}" role="switch" aria-checked="${x.avail!==false}"${x.archived?' disabled':''}>${x.avail===false?'86':'Disponible'}</button></span></div></article>`;
  }
  function groupCard(g){
    const used=D().items.filter(x=>(x.opts||[]).includes(g.id)).length;
    const gName=t(g.name);
    const choicesHtml=(g.choices||[]).map(c=>`<span class="mi-group-opt-pill">${esc(c.emoji||'')} ${esc(t(c.name))}${c.price?` <span class="price">+${cash(c.price)}</span>`:''}</span>`).join('')||esc(ui('noChoices'));
    return `<div class="mi-group-card"><div class="mi-group-card-head"><span class="mi-group-card-name">${esc(gName)}</span><span class="mi-group-card-pill ${g.required?'req':'opt'}">${esc(g.required?ui('required'):ui('optional'))}</span><span class="mi-group-card-pill mode">${esc(g.kind==='many'?ui('manyChoices'):ui('oneChoice'))}</span></div><div class="mi-group-card-opts">${choicesHtml}</div><div class="mi-group-card-scope">${esc(ui('usedByCount', { n: used }))}</div><div class="mi-group-card-acts"><button class="btn-slim" data-action="rmw-group-edit" data-arg="${g.id}">${ic('edit')} ${esc(ui('rename'))}</button><button class="btn-slim danger" data-action="rmw-group-delete" data-arg="${g.id}">${ic('trash')} ${esc(ui('delete'))}</button></div></div>`;
  }
  function menuPanel(){
    const d=D(),list=shownItems(),selected=filter==='all'?null:cat(filter),selectedIndex=selected?d.cats.findIndex(c=>c.id===selected.id):-1;
    const cats=`<div class="mi-cat-bar"><div class="mi-pill-row mi-cat-pills"><button class="mi-pill${filter==='all'?' on':''}" data-action="rmw-cat-filter" data-cat="all">${esc(ui('all'))}</button>${d.cats.map(c=>`<button class="mi-pill${filter===c.id?' on':''}" data-action="rmw-cat-filter" data-cat="${c.id}">${esc(t(c.name))}</button>`).join('')}</div><div class="mi-cat-bar-acts">${selected?`<button class="btn-slim" data-action="rmw-cat-move" data-arg="${selected.id}::-1"${selectedIndex<=0?' disabled':''}>${esc(ui('moveLeft'))}</button><button class="btn-slim" data-action="rmw-cat-move" data-arg="${selected.id}::1"${selectedIndex>=d.cats.length-1?' disabled':''}>${esc(ui('moveRight'))}</button><button class="btn-slim" data-action="rmw-cat-edit" data-arg="${selected.id}">${ic('edit')} ${esc(ui('renameSection'))}</button><button class="btn-slim danger" data-action="rmw-cat-delete" data-arg="${selected.id}">${ic('trash')} ${esc(ui('deleteSection'))}</button>`:''}<button class="btn-slim" data-action="rmw-cat-add">${ic('plus')} ${esc(ui('newSection').replace(/^\+\s*/,''))}</button><button class="btn-slim primary" data-action="rmw-item-add"${d.cats.length?'':' disabled'}>${ic('plus')} ${esc(ui('newItem').replace(/^\+\s*/,''))}</button></div></div>`;
    const body=d.items.length?(list.length?gridHtml(list):`<div class="rmw-empty" style="display:flex;flex-direction:column;align-items:center;padding:44px 20px;"><div style="width:44px;height:44px;border-radius:12px;background:rgba(11,110,79,0.10);border:1px solid rgba(11,110,79,0.18);color:var(--atlas);display:grid;place-items:center;margin-bottom:12px;"><svg width="22" height="22" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg></div><div style="font-weight:600;font-size:14.5px;color:var(--ink);margin-bottom:4px;">${esc(ui('noItemMatch'))}</div></div>`):`<div class="rmw-empty" style="display:flex;flex-direction:column;align-items:center;padding:48px 20px;"><div style="width:48px;height:48px;border-radius:14px;background:rgba(11,110,79,0.10);border:1px solid rgba(11,110,79,0.18);color:var(--atlas);display:grid;place-items:center;margin-bottom:16px;"><svg width="24" height="24" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg></div><h3 style="font-family:var(--sans);font-weight:600;font-size:18px;color:var(--ink);margin:0 0 6px;letter-spacing:-0.015em;">${esc(ui('emptyMenuTitle'))}</h3><p style="font-size:13px;color:var(--n-500);margin:0 0 18px;line-height:1.55;max-width:380px;text-align:center;">${esc(ui('emptyMenuDesc'))}</p><button class="btn-slim primary" data-action="rmw-cat-add">${esc(ui('createSectionBtn'))}</button></div>`;
    return `<section class="mi-section"><div class="mi-toolbar"><div class="mi-search"><input value="${esc(query)}" placeholder="${esc(ui('searchPlaceholder'))}" data-rmw-search/></div></div>${cats}${subChips()}${body}</section><section class="mi-section"><div class="mi-section-head"><h3>${esc(ui('modAndOpts'))}</h3><button class="btn-slim primary" data-action="rmw-group-add">${ic('plus')} ${esc(ui('newGroupBtn').replace(/^\+\s*/,''))}</button></div><div class="mi-groups-grid">${d.opts.map(groupCard).join('')||`<div class="rmw-empty">${esc(ui('noOptGroups'))}</div>`}</div></section>`;
  }
  function stationsPanel(){
    const d=D(),kid=S().kitchenId(venue());
    const cards=d.stations.map(s=>{
      const cats=d.cats.filter(c=>(c.station||kid)===s.id);
      const catCountStr = cats.length === 1 ? `1 ${ui('section')}` : `${cats.length} ${ui('sections')}`;
      return `<div class="mi-station mi-station-card"><div class="mi-station-top"><span class="mi-st-dot on" style="background:${esc(s.color||'#1F5D3C')}"></span><span class="mi-station-name">${esc(t(s.name))}</span>${s.id===kid?`<span class="mi-group-card-pill req">${esc(ui('defaultStationFallback'))}</span>`:''}</div><div class="mi-station-routed">${catCountStr} · ${cats.map(c=>esc(t(c.name))).join(', ')}</div><div class="mi-group-card-acts"><button class="btn-slim" data-action="rmw-station-edit" data-arg="${s.id}">${ic('edit')} ${esc(ui('rename'))}</button>${s.id!==kid?`<button class="btn-slim danger" data-action="rmw-station-delete" data-arg="${s.id}">${ic('trash')} ${esc(ui('delete'))}</button>`:''}</div></div>`;
    }).join('');
    const routes=d.cats.map(c=>`<div class="rmw-route"><b>${esc(t(c.name))}</b><select data-rmw-route="${c.id}"><option value="">${esc(ui('defaultRoute', { name: t(station(kid)?.name)||ui('kitchen') }))}</option>${d.stations.filter(s=>s.id!==kid).map(s=>`<option value="${s.id}"${c.station===s.id?' selected':''}>${esc(t(s.name))}</option>`).join('')}</select></div>`).join('');
    return `<section class="mi-section"><div class="mi-recettes-head"><div><div class="mi-title">${esc(ui('stationsTitle'))}</div><div class="mi-sub">${esc(ui('stationsSub'))}</div></div><button class="btn-slim primary" data-action="rmw-station-add">${ic('plus')} ${esc(ui('addStation'))}</button></div><div class="mi-stations">${cards||`<div class="rmw-empty">${esc(ui('addFirstStation'))}</div>`}</div><div class="mi-section-head"><h3>${esc(ui('routingBySection'))}</h3></div><div class="rmw-routes">${routes||`<div class="rmw-empty">${esc(ui('createSectionsForRouting'))}</div>`}</div></section>`;
  }
  function recipeStatus(m,r){
    if(!r?.ingredients?.length)return['opt',ui('statusToComplete')];
    if(!m?.costComplete)return['opt',ui('statusCostIncomplete')];
    if(m.actualCost==null)return['req',ui('statusCosted')];
    const gap=Math.abs(m.variancePct||0);
    return gap>15?['opt',ui('statusCheckStock')]:gap>5?['opt',ui('statusToMonitor')]:['req',ui('statusCostCompliant')];
  }
  function recipesPanel(){
    const api=window.KiwiRestaurantRecipes,items=D().items,done=items.filter(x=>api?.get(x.id,x.name,venue())?.ingredients?.length).length;
    return `<section class="mi-section"><div class="mi-recettes-head"><div><div class="mi-title">${esc(ui('recipesTitle'))}</div><div class="mi-sub">${esc(ui('recipesSub'))}</div></div><div class="mi-recettes-progress"><div class="mi-recettes-progress-l">${esc(ui('recipesCompletedCount', { done, total: items.length }))}</div><div class="mi-recettes-progress-bar"><i style="width:${items.length?done/items.length*100:0}%"></i></div></div></div><div class="rmw-recipe-list">${items.map(x=>{const r=api?.get(x.id,x.name,venue()),m=r?api?.metrics(x,r,venue()):null,[cls,label]=recipeStatus(m,r);return `<div class="rmw-recipe-card"><div><div class="rmw-recipe-name">${esc(t(x.name))}</div><div class="rmw-recipe-meta">${esc(ui('ingredientCount', { n: r?.ingredients?.length||0 }))}${r?.prepMinutes?` · ${r.prepMinutes} min`:''}</div></div><div class="rmw-recipe-result"><span class="mi-group-card-pill ${cls}">${esc(label)}</span>${m?.costComplete?`<small>${esc(ui('costSummaryPortion', { cost: m.theoreticalCost.toFixed(2) }))}</small>`:`<small>${esc(ui('missingCostOrQty'))}</small>`}</div><button class="btn-slim${r?'':' primary'}" data-action="rmw-recipe-edit" data-arg="${x.id}">${esc(r?ui('viewAndEdit'):ui('complete'))} →</button></div>`;}).join('')||`<div class="rmw-empty">${esc(ui('addItemsFirst'))}</div>`}</div></section>`;
  }
  function sales(){try{return window.KiwiSales?.list?.(venue())||[];}catch(_){return[];}}
  const norm=(v)=>String(v==null?'':v).trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  function median(values){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
  function performanceData(days=30){
    const items=D().items.map(x=>({item:x,qty:0,revenue:0,unitCost:null,unitProfit:null,profit:null,marginPct:null,quadrant:null,costSource:null}));
    const byId=new Map(items.map(x=>[String(x.item.id),x])),byName=new Map(items.map(x=>[norm(x.item.name),x]));
    const since=Date.now()-days*864e5;
    sales().forEach(s=>{
      if((+s.ts||0)<since)return;
      (Array.isArray(s.lines)?s.lines:[]).forEach(line=>{
        const row=(line?.id!=null&&byId.get(String(line.id)))||byName.get(norm(line?.name));
        if(!row)return;
        const qty=Math.max(0,+line.qty||0);
        if(!qty)return;
        const total=Number(line.total),unit=Number(line.unitPrice??line.unit??line.price);
        row.qty+=qty;
        row.revenue+=Number.isFinite(total)&&total>=0?total:(Number.isFinite(unit)&&unit>=0?unit*qty:(+row.item.price||0)*qty);
      });
    });
    const api=window.KiwiRestaurantRecipes;
    items.forEach(row=>{
      const recipe=api?.get?.(row.item.id,row.item.name,venue());
      const metrics=recipe?api?.metrics?.(row.item,recipe,venue()):null;
      if(metrics?.costComplete){
        row.unitCost=metrics.actualCost==null?+metrics.theoreticalCost:+metrics.actualCost;
        row.costSource=metrics.actualCost==null?'Recette':'Coût observé';
        row.unitProfit=(row.qty?row.revenue/row.qty:(+row.item.price||0))-row.unitCost;
        row.profit=row.revenue-row.unitCost*row.qty;
        row.marginPct=row.revenue>0?row.profit/row.revenue*100:null;
      }
    });
    const measured=items.filter(x=>x.qty>0&&x.unitProfit!=null&&Number.isFinite(x.unitProfit));
    const medQty=median(measured.map(x=>x.qty)),medProfit=median(measured.map(x=>x.unitProfit));
    measured.forEach(x=>{const popular=x.qty>=medQty,profitable=x.unitProfit>=medProfit;x.quadrant=popular&&profitable?'star':popular?'plow':profitable?'puzzle':'dog';});
    const totalRevenue=items.reduce((n,x)=>n+x.revenue,0),costedRevenue=measured.reduce((n,x)=>n+x.revenue,0),grossProfit=measured.reduce((n,x)=>n+x.profit,0);
    return {items,measured,medQty,medProfit,totalRevenue,costedRevenue,grossProfit,coverage:totalRevenue?costedRevenue/totalRevenue*100:0,days};
  }
  function perfQuads(){
    return {
      star:{title:ui('quadStar'),hint:ui('quadStarHint'),action:ui('quadStarAction')},
      plow:{title:ui('quadPlow'),hint:ui('quadPlowHint'),action:ui('quadPlowAction')},
      puzzle:{title:ui('quadPuzzle'),hint:ui('quadPuzzleHint'),action:ui('quadPuzzleAction')},
      dog:{title:ui('quadDog'),hint:ui('quadDogHint'),action:ui('quadDogAction')},
    };
  }
  function performanceMatrix(p){
    const maxQty=Math.max(1,...p.measured.map(x=>x.qty)),maxProfit=Math.max(1,...p.measured.map(x=>Math.max(0,x.unitProfit))),maxRevenue=Math.max(1,...p.measured.map(x=>x.revenue));
    const x=v=>Math.sqrt(Math.max(0,v)/maxQty)*100,y=v=>Math.sqrt(Math.max(0,v)/maxProfit)*100;
    const counts={star:0,plow:0,puzzle:0,dog:0};p.measured.forEach(r=>counts[r.quadrant]++);
    const legend=[['star',ui('legendStar')],['puzzle',ui('legendPuzzle')],['plow',ui('legendPlow')],['dog',ui('legendDog')]].map(([q,label])=>`<span class="${q}"><i></i>${esc(label)}<b>${counts[q]}</b></span>`).join('');
    const dots=p.measured.map((r,i)=>{const size=11+Math.sqrt(r.revenue/maxRevenue)*19;const cName=cat(r.item.catId)?.name?t(cat(r.item.catId).name):ui('article');const itName=t(r.item.name);return `<button class="rmw-perf-dot ${r.quadrant}" style="left:${x(r.qty).toFixed(2)}%;bottom:${y(r.unitProfit).toFixed(2)}%;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;z-index:${i+1}" data-action="rmw-recipe-edit" data-arg="${esc(r.item.id)}" aria-label="${esc(itName)}"><span><em>${esc(cName)}</em><b>${esc(itName)}</b><small><i>${r.qty.toLocaleString('fr-FR')} ${esc(ui('colSold').toLowerCase())}</i><i>${cash(r.revenue)} ${esc(ui('colRevenueDesc'))}</i><i>${cash(r.profit)} ${esc(ui('colProfitDesc'))}</i></small><strong>${r.marginPct==null?'·':r.marginPct.toFixed(1)+' %'} ${esc(ui('colMarginDesc'))}</strong></span></button>`;}).join('');
    return `<div class="rmw-perf-matrix"><div class="rmw-perf-legend">${legend}</div><div class="rmw-perf-chart"><div class="rmw-perf-y">${esc(ui('grossProfitPerItem'))}</div><div class="rmw-perf-plot"><i class="rmw-perf-v" style="left:${x(p.medQty).toFixed(2)}%"></i><i class="rmw-perf-h" style="bottom:${y(p.medProfit).toFixed(2)}%"></i><div class="rmw-perf-label puzzle"><b>${esc(ui('matrixLabelPuzzle'))}</b><small>${esc(ui('matrixHintPuzzle'))}</small></div><div class="rmw-perf-label star"><b>${esc(ui('matrixLabelStar'))}</b><small>${esc(ui('matrixHintStar'))}</small></div><div class="rmw-perf-label dog"><b>${esc(ui('matrixLabelDog'))}</b><small>${esc(ui('matrixHintDog'))}</small></div><div class="rmw-perf-label plow"><b>${esc(ui('matrixLabelPlow'))}</b><small>${esc(ui('matrixHintPlow'))}</small></div>${dots}</div><div class="rmw-perf-x">${esc(ui('popularityXDays', { n: p.days }))}</div></div><div class="rmw-perf-caption"><span>${esc(ui('perfDotSizeHint'))}</span><span>${esc(ui('perfAxesHint'))}</span><span>${esc(ui('perfClickHint'))}</span></div></div>`;
  }
  function performancePanel(){
    const p=performanceData(30),costed=p.measured.length,buckets={star:[],plow:[],puzzle:[],dog:[]};
    p.measured.forEach(x=>buckets[x.quadrant].push(x));
    const quads = perfQuads();
    const cards=Object.entries(quads).map(([key,q])=>{const list=buckets[key].sort((a,b)=>b.profit-a.profit),names=list.slice(0,3).map(x=>esc(t(x.item.name))).join(' · ')||'·',profit=list.reduce((n,x)=>n+x.profit,0);const countStr = list.length === 1 ? `1 ${ui('article')}` : `${list.length} ${ui('articles')}`;return `<div class="rmw-perf-q ${key}"><h4>${esc(q.title.toUpperCase())}</h4><strong>${countStr}</strong><p>${esc(q.hint)}</p><div><span>Top</span>${names}</div><footer><b>${cash(profit)}</b> ${esc(ui('colProfit').toLowerCase())} <small>${esc(q.action)}</small></footer></div>`;}).join('');
    const rows=[...p.items].sort((a,b)=>b.profit-a.profit||b.revenue-a.revenue).map(r=>{const itName=t(r.item.name),catName=cat(r.item.catId)?.name?t(cat(r.item.catId).name):ui('noSection');return `<tr><td><b>${esc(itName)}</b><small>${esc(catName)}</small></td><td>${r.qty.toLocaleString('fr-FR')}</td><td>${cash(r.revenue)}</td><td>${r.unitCost==null?'<button class="rmw-perf-link" data-action="rmw-recipe-edit" data-arg="'+esc(r.item.id)+'">'+esc(ui('completeRecipeLink'))+'</button>':`${cash(r.unitCost)}<small>${r.costSource}</small>`}</td><td>${r.profit==null?'·':cash(r.profit)}</td><td>${r.marginPct==null?'·':`<span class="rmw-perf-margin ${r.marginPct>=65?'hi':r.marginPct>=50?'mid':'lo'}">${r.marginPct.toFixed(1)} %</span>`}</td><td>${r.quadrant?quads[r.quadrant].title:(r.qty?ui('marginMissing'):ui('noSaleRecorded'))}</td></tr>`;}).join('');
    if(!p.items.length)return `<section class="mi-section"><div class="rmw-empty"><h3>${esc(ui('noItemsToAnalyze'))}</h3><p>${esc(ui('noItemsToAnalyzeDesc'))}</p></div></section>`;
    const emptySales=!p.items.some(x=>x.qty>0);
    return `<div class="rmw-performance"><section class="mi-section"><div class="mi-recettes-head"><div><div class="mi-title">${esc(ui('perfTitle'))}</div><div class="mi-sub">${esc(ui('perfSub'))}</div></div><div class="rmw-perf-period">${esc(ui('daysCount', { n: 30 }))}</div></div>${emptySales?`<div class="rmw-empty"><h3>${esc(ui('noSalesYet'))}</h3><p>${esc(ui('noSalesYetDesc'))}</p></div>`:costed?performanceMatrix(p):`<div class="rmw-empty"><h3>${esc(ui('completeRecipesForProfit'))}</h3><p>${esc(ui('completeRecipesForProfitDesc'))}</p></div>`}</section><div class="rmw-perf-kpis"><div><span>${esc(ui('analyzedRevenue'))}</span><b>${cash(p.totalRevenue)}</b><small>${p.items.reduce((n,x)=>n+x.qty,0).toLocaleString('fr-FR')} ${esc(ui('itemsSold'))}</small></div><div><span>${esc(ui('grossProfitCalc'))}</span><b>${costed?cash(p.grossProfit):'·'}</b><small>${esc(ui('recipesSoldAndCosted', { n: costed }))}</small></div><div><span>${esc(ui('costCoverage'))}</span><b>${p.totalRevenue?p.coverage.toFixed(0)+' %':'·'}</b><small>${esc(ui('costCoverageSub'))}</small></div></div>${costed?`<div class="rmw-perf-quads">${cards}</div>`:''}<section class="mi-section"><div class="mi-section-head"><h3>${esc(ui('colItem'))}</h3></div><div class="mi-list-wrap"><table class="mi-list rmw-perf-table"><thead><tr><th>${esc(ui('colItem'))}</th><th>${esc(ui('colSold'))}</th><th>${esc(ui('colRevenue'))}</th><th>${esc(ui('colUnitCost'))}</th><th>${esc(ui('colProfit'))}</th><th>${esc(ui('colMargin'))}</th><th>${esc(ui('colReadout'))}</th></tr></thead><tbody>${rows}</tbody></table></div></section></div>`;
  }
  const SERVICE_WINDOWS=[
    {id:'matin',name:'Matin',from:5*60,to:11*60},
    {id:'midi',name:'Midi',from:11*60,to:15*60},
    {id:'soir',name:'Soir',from:19*60,to:29*60},
  ];
  function minuteLabel(value){const m=((Math.round(value)%1440)+1440)%1440,h=Math.floor(m/60),mm=m%60;return `${String(h).padStart(2,'0')}h${mm?String(mm).padStart(2,'0'):''}`;}
  function openingSpans(){
    const api=window.KiwiHours,doc=api?.get?.(venue());
    if(!api?.isConfigured?.(venue())||!doc?.week)return [];
    const spans=[];
    (api.DAYS||Object.keys(doc.week)).forEach(day=>{
      const d=doc.week[day];
      if(!d?.open)return;
      (d.periods||[]).forEach(p=>{
        const from=api.toMin?.(p.from),duration=api.span?.(p);
        if(from==null||!duration)return;
        spans.push({from,to:from+duration});
        /* A service entered as 00:00–02:00 belongs to the evening analysis
         * too, even when it is stored as a separate post-midnight period. */
        if(from<5*60)spans.push({from:from+1440,to:from+duration+1440});
      });
    });
    return spans;
  }
  function servicePeriods(){
    const spans=openingSpans();
    return SERVICE_WINDOWS.map(service=>{
      const overlaps=spans.map(span=>({from:Math.max(span.from,service.from),to:Math.min(span.to,service.to)})).filter(x=>x.to>x.from);
      if(!overlaps.length)return null;
      const from=Math.min(...overlaps.map(x=>x.from)),to=Math.max(...overlaps.map(x=>x.to));
      return {...service,from,to,label:`${service.name} (${minuteLabel(from)}-${minuteLabel(to)})`};
    }).filter(Boolean);
  }
  function minuteInService(ts,service){const d=new Date(ts),plain=d.getHours()*60+d.getMinutes(),m=service.to>1440&&plain<service.to-1440?plain+1440:plain;return m>=service.from&&m<service.to;}
  function lineRevenue(line,menuItem,qty){const total=Number(line?.total),unit=Number(line?.unitPrice??line?.unit??line?.price);return Number.isFinite(total)&&total>=0?total:(Number.isFinite(unit)&&unit>=0?unit*qty:(+menuItem.price||0)*qty);}
  function hoursData(periods,selected,days=30){
    const rows=D().items.map(x=>({item:x,qty:0,revenue:0,byPeriod:{}})),byId=new Map(rows.map(x=>[String(x.item.id),x])),byName=new Map(rows.map(x=>[norm(x.item.name),x])),since=Date.now()-days*864e5;
    sales().forEach(s=>{
      const ts=+s.ts||0;if(ts<since)return;
      const service=periods.find(p=>minuteInService(ts,p));if(!service)return;
      (Array.isArray(s.lines)?s.lines:[]).forEach(line=>{
        const row=(line?.id!=null&&byId.get(String(line.id)))||byName.get(norm(line?.name)),qty=Math.max(0,+line?.qty||0);
        if(!row||!qty)return;
        row.byPeriod[service.id]=(row.byPeriod[service.id]||0)+qty;
        if(service.id===selected.id){row.qty+=qty;row.revenue+=lineRevenue(line,row.item,qty);}
      });
    });
    const ranked=rows.filter(x=>x.qty>0).sort((a,b)=>b.qty-a.qty||b.revenue-a.revenue),totalQty=ranked.reduce((n,x)=>n+x.qty,0),totalRevenue=ranked.reduce((n,x)=>n+x.revenue,0);
    const notable=rows.map(row=>{const total=Object.values(row.byPeriod).reduce((n,x)=>n+x,0),best=periods.slice().sort((a,b)=>(row.byPeriod[b.id]||0)-(row.byPeriod[a.id]||0))[0],qty=best?(row.byPeriod[best.id]||0):0;return{row,total,best,qty,share:total?qty/total*100:0};}).filter(x=>x.total>=2&&x.share>=Math.max(55,100/periods.length+15)).sort((a,b)=>b.share-a.share||b.total-a.total).slice(0,5);
    return {ranked,totalQty,totalRevenue,top:ranked[0]||null,notable,days};
  }
  function hoursPanel(){
    const api=window.KiwiHours;
    if(!api?.isConfigured?.(venue()))return `<section class="mi-section"><div class="rmw-empty"><h3>${esc(ui('setHoursPrompt'))}</h3><p>${esc(ui('setHoursPromptDesc'))}</p></div></section>`;
    const periods=servicePeriods();
    if(!periods.length)return `<section class="mi-section"><div class="rmw-empty"><h3>${esc(ui('noServiceToAnalyze'))}</h3><p>${esc(ui('noServiceToAnalyzeDesc'))}</p></div></section>`;
    if(!periods.some(x=>x.id===hoursPeriod))hoursPeriod=periods[0].id;
    const selected=periods.find(x=>x.id===hoursPeriod)||periods[0],data=hoursData(periods,selected),max=Math.max(1,...data.ranked.slice(0,10).map(x=>x.qty));
    const pills=periods.map(p=>`<button class="mi-pill${p.id===selected.id?' on':''}" data-action="rmw-hours-period" data-period="${p.id}">${esc(p.label)}</button>`).join('');
    const bars=data.ranked.slice(0,10).map(row=>`<div class="rmw-hours-row"><div class="rmw-hours-name" title="${esc(t(row.item.name))}">${esc(t(row.item.name))}</div><div class="rmw-hours-track"><i style="width:${(row.qty/max*100).toFixed(1)}%"></i></div><b>${row.qty.toLocaleString('fr-FR')}</b></div>`).join('');
    const totalForTop=data.top?Object.values(data.top.byPeriod).reduce((n,x)=>n+x,0):0,topShare=data.top&&totalForTop?data.top.qty/totalForTop*100:0;
    const insight=data.top?`<div class="rmw-hours-insight"><span>${esc(ui('peakInsightTag', { label: selected.label }))}</span><h3>${esc(ui('peakInsightTitle', { item: t(data.top.item.name) }))}</h3><p>${esc(ui('peakInsightBody', { qty: data.top.qty.toLocaleString('fr-FR'), share: (data.top.qty/data.totalQty*100).toFixed(0), peakShare: topShare.toFixed(0), period: selected.name.toLowerCase() }))}</p></div>`:'';
    const notable=data.notable.map(x=>`<div class="rmw-hours-notable"><i></i><div><b>${esc(t(x.row.item.name))}</b><span>${esc(ui('peakNotableBody', { share: x.share.toFixed(0), total: x.total.toLocaleString('fr-FR'), period: x.best.name.toLowerCase(), hours: `${minuteLabel(x.best.from)}-${minuteLabel(x.best.to)}` }))}</span></div></div>`).join('');
    const topQtyStr = data.top ? `${data.top.qty.toLocaleString('fr-FR')} ${data.top.qty !== 1 ? ui('articles') : ui('article')}` : ui('noSaleRecorded');
    return `<div class="rmw-hours-page"><section class="mi-section"><div class="mi-section-head"><div><h3>${esc(ui('hoursTitle'))}</h3><div class="mi-section-sub">${esc(ui('hoursSub', { n: data.days }))}</div></div></div><div class="mi-pill-row rmw-hours-pills">${pills}</div><div class="rmw-hours-kpis"><div><span>${esc(ui('itemsSold'))}</span><b>${data.totalQty.toLocaleString('fr-FR')}</b><small>${esc(selected.label)}</small></div><div><span>${esc(ui('generatedRevenue'))}</span><b>${cash(data.totalRevenue)}</b><small>${esc(ui('inPeriod'))}</small></div><div><span>${esc(ui('topItem'))}</span><b>${data.top?esc(t(data.top.item.name)):'·'}</b><small>${esc(topQtyStr)}</small></div></div><div class="rmw-hours-list-title">${esc(ui('top10Items', { label: selected.label }))}</div>${bars?`<div class="rmw-hours-bars">${bars}</div>`:`<div class="rmw-empty"><h3>${esc(ui('noSalesInPeriod'))}</h3><p>${esc(ui('noSalesInPeriodDesc'))}</p></div>`}</section>${insight}${notable?`<section class="mi-section"><div class="mi-section-head"><h3>${esc(ui('itemsWithPeak'))}</h3></div><div class="rmw-hours-notables">${notable}</div></section>`:''}</div>`;
  }
  function alertsPanel(){
    const rows=D().items.filter(x=>x.avail===false).map(x=>`<div class="mi-group-card"><div class="mi-group-card-head"><span class="mi-group-card-name">${esc(t(x.name))}</span><span class="mi-group-card-pill req">${esc(ui('unavailableBadge'))}</span></div><button class="btn-slim primary" data-action="rmw-reactivate" data-arg="${x.id}">${esc(ui('reactivate'))}</button></div>`).join('');
    return `<section class="mi-section"><div class="mi-title">${esc(ui('alerts86Title'))}</div><div class="mi-sub">${esc(ui('alerts86Sub'))}</div><div class="mi-groups-grid">${rows||`<div class="rmw-empty">${esc(ui('no86Alerts'))}</div>`}</div></section>`;
  }
  function nfcPanel(){
    const on=!!window.KiwiOrderProPanel?.enabled?.();
    return `<section class="mi-section"><div class="mi-title">${esc(ui('nfcTitle'))}</div><div class="mi-sub">${esc(ui('nfcSub'))}</div>${on?'<div class="rmw-nfc" data-rmw-nfc></div>':`<div class="rmw-empty"><h3>${esc(ui('nfcUnavailable'))}</h3><p>${esc(ui('nfcUnavailableDesc'))}</p></div>`}</section>`;
  }
  const modal=(o)=>window.Kiwi?.modal?.(o);
  function ask(title,label,value,save){const m=modal({title,width:460,body:`<label class="kf-label">${esc(label)}</label><input class="kf-input" data-value value="${esc(value||'')}"/>`,foot:`<button class="kb ghost" data-cancel>${esc(ui('cancelBtn'))}</button><button class="eq-cta-gradient" data-save>${esc(ui('saveBtn'))}</button>`});$('[data-cancel]',m.el).onclick=m.close;$('[data-save]',m.el).onclick=()=>{const v=$('[data-value]',m.el).value.trim();if(!v)return;save(v);m.close();render();};$('[data-value]',m.el).focus();}
  function openCategory(x){
    const d=D(),kid=S().kitchenId(venue());
    const m=modal({title:x?ui('editSectionTitle'):ui('newSectionTitle'),width:500,body:`<div class="kf-group"><label class="kf-label">${esc(ui('sectionNameLabel'))}</label><input class="kf-input" data-name value="${esc(x?.name||'')}" placeholder="${esc(ui('sectionNamePlaceholder'))}"/></div>${x?`<div class="kf-group"><label class="kf-label">${esc(ui('stationLabel'))}</label><select class="kf-input" data-station><option value="">${esc(ui('defaultRoute', { name: t(station(kid)?.name)||ui('kitchen') }))}</option>${d.stations.filter(s=>s.id!==kid).map(s=>`<option value="${s.id}"${x.station===s.id?' selected':''}>${esc(t(s.name))}</option>`).join('')}</select></div>`:''}`,foot:`<button class="kb ghost" data-cancel>${esc(ui('cancelBtn'))}</button><button class="eq-cta-gradient" data-save>${esc(ui('saveBtn'))}</button>`});
    $('[data-cancel]',m.el).onclick=m.close;$('[data-save]',m.el).onclick=()=>{const n=$('[data-name]',m.el).value.trim();if(!n)return;if(x){S().renameCategory(x.id,n);S().setCategoryStation(x.id,$('[data-station]',m.el).value);}else S().addCategory(n);m.close();render();};
  }
  async function upload(file,kind,status){if(!file)return'';if(!window.KiwiOrderPro?.uploadMedia){status.textContent='Stockage média indisponible.';return'';}status.textContent='Envoi…';try{const r=await window.KiwiOrderPro.uploadMedia(file,{kind}),u=typeof r==='string'?r:r?.url||'';status.textContent=u?'Média prêt.':(window.KiwiOrderPro.uploadError?window.KiwiOrderPro.uploadError(r):'Envoi impossible.');return u;}catch(_){status.textContent='Envoi impossible.';return'';}}
  function openItem(x){
    const d=D();if(!d.cats.length){openCategory(null);return;}let photo=x?.photo||'',video=x?.video||'';const availableItems=(d.items||[]).filter(it=>(!x||it.id!==x.id)&&!it.archived);const archivedItems=(d.items||[]).filter(it=>it&&it.archived&&(!x||it.id!==x.id));
    const formulaTemplates=[...(d.formulaTemplates||[]).filter(t=>t?.formula?.slots?.length).map(t=>({id:'template:'+t.id,name:t.name,formula:t.formula})),...(d.items||[]).filter(it=>it.formula?.slots?.length).map(it=>({id:'item:'+it.id,name:`${t(it.name)}`,formula:it.formula}))];
    let formulaSlots=x?.formula?.slots?JSON.parse(JSON.stringify(x.formula.slots)):[],expandedFormulaSlot=formulaSlots.length?0:-1;
    const slotRowHtml=(slot,si)=>{
      const choicesHtml=(slot.choices||[]).map((ch,ci)=>{const itemHit=d.items.find(it=>it.id===ch.itemId);const name=itemHit?t(itemHit.name):ch.itemId;return `<div class="rmw-slot-choice-row" data-si="${si}" data-ci="${ci}"><span class="rmw-slot-choice-main"><span class="rmw-choice-index">${ci+1}</span><span class="rmw-choice-name">${esc(name)}</span></span><label class="rmw-slot-choice-extra"><span class="rmw-extra-label">${esc(ui('extra'))}</span><span class="rmw-extra-control"><span>+</span><input class="kf-input" type="number" min="0" data-ch-extra="${si}-${ci}" value="${+ch.extra||0}"/><span>MAD</span></span></label><button type="button" class="mi-ic-btn danger" data-del-choice="${si}-${ci}" aria-label="${esc(ui('removeChoice'))}">${ic('trash')}</button></div>`;}).join('');
      const avToAdd=availableItems.filter(it=>!(slot.choices||[]).some(c=>c.itemId===it.id));
      const pickerOption=(it,category)=>{const sub=category&&(category.sub||[]).find(entry=>entry.id===it.subId),context=sub?t(sub.name):(category?t(category.name):ui('noSection')),search=`${t(it.name)||''} ${category?t(category.name):''} ${sub?t(sub.name):''}`.toLocaleLowerCase();return `<button type="button" class="rmw-formula-picker-option" role="option" data-rmw-picker-item="${esc(it.id)}" data-rmw-picker-si="${si}" data-picker-search="${esc(search)}"><span class="rmw-formula-picker-option-copy"><strong>${esc(t(it.name))}</strong><small>${esc(context)}</small></span><span class="rmw-formula-picker-price">${cash(it.price)}</span><span class="rmw-formula-picker-add">${ic('plus')}</span></button>`;};
      const pickerGroups=d.cats.map(category=>{const items=avToAdd.filter(it=>it.catId===category.id);return items.length?`<section class="rmw-formula-picker-group" data-picker-group><div class="rmw-formula-picker-group-title">${esc(t(category.name))}</div>${items.map(it=>pickerOption(it,category)).join('')}</section>`:'';}).join(''),uncategorized=avToAdd.filter(it=>!d.cats.some(category=>category.id===it.catId)),pickerGroupsHtml=pickerGroups+(uncategorized.length?`<section class="rmw-formula-picker-group" data-picker-group><div class="rmw-formula-picker-group-title">${esc(ui('noSection'))}</div>${uncategorized.map(it=>pickerOption(it,null)).join('')}</section>`:'');
      let addBarHtml='';
      if(availableItems.length===0){
        addBarHtml=`<div class="rmw-slot-empty-notice" style="background:var(--n-50,#f8f9fa);border:1px dashed var(--n-300,#d0d5dd);border-radius:6px;padding:10px 12px;margin-top:6px;font-size:12px;color:var(--n-700,#344054);"><div>${esc(ui('noItemsOnMenuFormulaNotice'))}</div><button type="button" class="btn-slim" data-f-save-and-create style="margin-top:8px;font-weight:600;">${esc(ui('saveAndCreateItemBtn'))}</button></div>`;
      }else if(avToAdd.length===0){
        addBarHtml=`<div class="rmw-slot-all-chosen" style="font-size:11.5px;color:var(--n-500);padding:4px 0;">${esc(ui('allChosenNotice'))}</div>`;
      }else{
        addBarHtml=`<div class="rmw-slot-add-bar"><button type="button" class="rmw-formula-picker-trigger" data-rmw-picker-toggle="${si}" aria-haspopup="listbox" aria-expanded="false"><span class="rmw-formula-picker-icon">${pickerSearchIcon}</span><span class="rmw-formula-picker-copy"><strong>${esc(ui('addChoiceBtn'))}</strong><small>${esc(ui('chooseItemPlaceholder'))}</small></span><span class="rmw-formula-picker-chevron">${pickerChevronIcon}</span></button><div class="rmw-formula-picker" data-rmw-picker-panel="${si}" role="listbox" aria-label="${esc(ui('chooseItemPlaceholder'))}" hidden><div class="rmw-formula-picker-search"><label>${pickerSearchIcon}<input type="search" data-rmw-picker-search="${si}" placeholder="${esc(ui('searchPlaceholder'))}" autocomplete="off"/></label></div><div class="rmw-formula-picker-results">${pickerGroupsHtml}<div class="rmw-formula-picker-empty" data-picker-empty hidden>${esc(ui('noItemMatch'))}</div></div></div></div>`;
      }
      return `<div class="rmw-slot-card${expandedFormulaSlot===si?' is-expanded':''}" data-slot-idx="${si}"><div class="rmw-slot-head"><div class="rmw-slot-title"><span class="rmw-slot-kicker">${esc(ui('step'))} ${si+1}</span><input class="kf-input" data-slot-label="${si}" value="${esc(slot.label||'')}" placeholder="${esc(ui('stepTitlePlaceholder'))}"/><span class="rmw-slot-summary">${(slot.choices||[]).length} ${esc(ui('choicesLabel')).toLocaleLowerCase()} · ${esc(ui('minLabel'))} ${slot.min!=null?slot.min:1} · ${esc(ui('maxLabel'))} ${slot.max!=null?slot.max:1}</span></div><div class="rmw-slot-bounds" role="group" aria-label="${esc(ui('selectionRule'))}"><label><span>${esc(ui('minLabel'))}</span><input class="kf-input" type="number" min="0" max="10" data-slot-min="${si}" value="${slot.min!=null?slot.min:1}"/></label><label><span>${esc(ui('maxLabel'))}</span><input class="kf-input" type="number" min="1" max="10" data-slot-max="${si}" value="${slot.max!=null?slot.max:1}"/></label></div><button type="button" class="mi-ic-btn rmw-slot-toggle" data-slot-toggle="${si}" aria-expanded="${expandedFormulaSlot===si?'true':'false'}" aria-label="${esc(ui('step'))} ${si+1}">${pickerChevronIcon}</button><button type="button" class="mi-ic-btn danger rmw-slot-delete" data-del-slot="${si}" aria-label="${esc(ui('deleteStep'))}">${ic('trash')}</button></div><div class="rmw-slot-body"${expandedFormulaSlot===si?'':' hidden'}><div class="rmw-slot-choices">${choicesHtml||`<span class="kf-help">${esc(ui('noChoicesInStep'))}</span>`}</div>${addBarHtml}</div></div>`;
    };
    const m=modal({title:x?ui('editItemTitle', { name: t(x.name) }):ui('newItemTitle'),width:680,body:`<div class="kf-row"><div class="kf-group"><label class="kf-label">${esc(ui('nameLabel'))}</label><input class="kf-input" data-name value="${esc(x?.name||'')}"/></div><div class="kf-group"><label class="kf-label">${esc(ui('priceLabel'))}</label><input class="kf-input" type="number" min="0" data-price value="${+x?.price||0}"/></div></div><div class="kf-row"><div class="kf-group"><label class="kf-label">${esc(ui('sectionLabel'))}</label><select class="kf-input" data-cat>${d.cats.map(c=>`<option value="${c.id}"${x?.catId===c.id?' selected':''}>${esc(t(c.name))}</option>`).join('')}</select></div><div class="kf-group"><label class="kf-label">${esc(ui('availabilityLabel'))}</label><select class="kf-input" data-avail><option value="1"${x?.avail!==false?' selected':''}>${esc(ui('availableOpt'))}</option><option value="0"${x?.avail===false?' selected':''}>${esc(ui('unavailableOpt'))}</option></select></div></div><div class="kf-group"><label class="rmw-standalone"><input type="checkbox" data-standalone${x?.formulaOnly?'':' checked'}/> <span>${esc(ui('standalone'))}</span></label><div class="kf-help">${esc(ui('formulaOnly'))}</div></div><div class="kf-group"><label class="kf-label">${esc(ui('descLabel'))}</label><textarea class="kf-input" data-desc>${esc(x?.desc||'')}</textarea></div><div class="kf-group"><label class="kf-label">${esc(ui('mediaLabel'))}</label><div class="rmw-media-actions"><label class="btn-slim">${esc(ui('addPhotoBtn'))}<input hidden type="file" accept="image/*" data-photo/></label><label class="btn-slim">${esc(ui('addVideoBtn'))}<input hidden type="file" accept="video/*" data-video/></label><button class="btn-slim" type="button" data-media-remove>${esc(ui('removeMediaBtn'))}</button></div><div class="kf-help" data-media-status>${photo||video?esc(ui('mediaStatusKept')):esc(ui('noMediaStatus'))}</div></div><div class="kf-group"><label class="kf-label">${esc(ui('itemOptionsLabel'))}</label><div class="rmw-checks">${d.opts.map(g=>`<label><input type="checkbox" data-opt="${g.id}"${(x?.opts||[]).includes(g.id)?' checked':''}/> ${esc(t(g.name))}</label>`).join('')||`<span class="kf-help">${esc(ui('createOptGroupFirst'))}</span>`}</div></div>
<div class="kf-group" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--n-200);"><label style="display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer;"><input type="checkbox" data-is-formula ${formulaSlots.length?'checked':''}/><span>${esc(ui('isFormulaLabel'))}</span></label><div class="kf-help">${esc(ui('isFormulaHelp'))}</div>
<div class="rmw-formula-template" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:10px;"><select class="kf-input" data-formula-template><option value="">${formulaTemplates.length?esc(ui('formulaTemplatePlaceholder')):esc(ui('noFormulaTemplates'))}</option>${formulaTemplates.map(it=>`<option value="${it.id}">${esc(it.name)}</option>`).join('')}</select><button type="button" class="btn-slim" data-apply-formula-template ${formulaTemplates.length?'':'disabled'}>${esc(ui('copyTemplateBtn'))}</button><button type="button" class="btn-slim" data-save-formula-template style="grid-column:1/-1;justify-content:center;">${esc(ui('saveTemplateBtn'))}</button></div>
<div class="rmw-formula-builder" data-formula-wrap ${formulaSlots.length?'':'hidden'} style="margin-top:10px;display:grid;gap:10px;"><div data-slots-wrap style="display:grid;gap:10px;"></div><button type="button" class="btn-slim" data-add-slot style="justify-content:center;">${ic('plus')} ${esc(ui('addStepBtn'))}</button>${archivedItems.length?`<details class="rmw-archived-group"><summary>${esc(ui('archivedGroup'))} · ${archivedItems.length}</summary>${archivedItems.map(it=>`<button type="button" disabled>${esc(t(it.name))}</button>`).join('')}</details>`:''}</div></div>`,foot:(x?`<button class="kb ghost danger" data-archive>${esc(x.archived?ui('restore'):ui('archive'))}</button>`:'')+`<button class="kb ghost" data-cancel>${esc(ui('cancelBtn'))}</button><button class="eq-cta-gradient" data-save>${esc(ui('saveBtn'))}</button>`});m.el.classList.add('rmw-item-workspace');const isFormulaCb=$('[data-is-formula]',m.el),formulaWrap=$('[data-formula-wrap]',m.el),slotsWrap=$('[data-slots-wrap]',m.el);const renderSlots=()=>{if(!slotsWrap)return;slotsWrap.innerHTML=formulaSlots.map(slotRowHtml).join('')||'<span class="kf-help">Aucune étape.</span>';};
    const formulaTemplateSelect=$("[data-formula-template]",m.el),applyFormulaTemplate=$("[data-apply-formula-template]",m.el);if(applyFormulaTemplate)applyFormulaTemplate.onclick=()=>{const template=formulaTemplates.find(it=>it.id===formulaTemplateSelect?.value);if(!template)return;formulaSlots=JSON.parse(JSON.stringify(template.formula.slots));expandedFormulaSlot=formulaSlots.length?0:-1;isFormulaCb.checked=true;if(formulaWrap)formulaWrap.hidden=false;renderSlots();toast('Formule copiée',template.name);};const saveFormulaTemplateBtn=$("[data-save-formula-template]",m.el);if(saveFormulaTemplateBtn)saveFormulaTemplateBtn.onclick=()=>{const clean={slots:JSON.parse(JSON.stringify(formulaSlots))};if(!clean.slots.some(s=>s?.choices?.length)){toast('Formule vide','Ajoutez au moins un choix avant de l’enregistrer.','warn');return;}ask(ui('saveTemplateBtn'),'Nom du modèle',x?.name||'',name=>{S().saveFormulaTemplate(name,clean);toast('Formule enregistrée',name);});};
    isFormulaCb.onchange=()=>{const on=!!isFormulaCb.checked;if(on&&!formulaSlots.length){formulaSlots.push({id:'sl_1',label:'',min:1,max:1,choices:[]});expandedFormulaSlot=0;}if(formulaWrap)formulaWrap.hidden=!on;renderSlots();};$('[data-add-slot]',m.el).onclick=()=>{if(formulaSlots.length>=10)return;formulaSlots.push({id:'sl_'+(formulaSlots.length+1),label:'',min:1,max:1,choices:[]});expandedFormulaSlot=formulaSlots.length-1;renderSlots();};slotsWrap.addEventListener('input',e=>{const pickerSearch=e.target.closest('[data-rmw-picker-search]');if(pickerSearch){const panel=pickerSearch.closest('[data-rmw-picker-panel]'),term=pickerSearch.value.trim().toLocaleLowerCase();let visible=0;panel.querySelectorAll('[data-picker-search]').forEach(option=>{const match=!term||(option.dataset.pickerSearch||'').includes(term);option.hidden=!match;if(match)visible+=1;});panel.querySelectorAll('[data-picker-group]').forEach(group=>{group.hidden=!group.querySelector('[data-picker-search]:not([hidden])');});const empty=panel.querySelector('[data-picker-empty]');if(empty)empty.hidden=visible!==0;return;}const lbl=e.target.closest('[data-slot-label]');if(lbl){const si=+lbl.dataset.slotLabel;if(formulaSlots[si])formulaSlots[si].label=lbl.value;return;}const min=e.target.closest('[data-slot-min]');if(min){const si=+min.dataset.slotMin;if(formulaSlots[si])formulaSlots[si].min=Math.max(0,Math.min(10,+min.value||0));return;}const max=e.target.closest('[data-slot-max]');if(max){const si=+max.dataset.slotMax;if(formulaSlots[si])formulaSlots[si].max=Math.max(1,Math.min(10,+max.value||1));return;}const ext=e.target.closest('[data-ch-extra]');if(ext){const [si,ci]=ext.dataset.chExtra.split('-').map(Number);if(formulaSlots[si]?.choices?.[ci])formulaSlots[si].choices[ci].extra=Math.max(0,+ext.value||0);}});slotsWrap.addEventListener('click',e=>{const sc=e.target.closest('[data-f-save-and-create]');if(sc){saveItem(()=>{openItem(null);});return;}const st=e.target.closest('[data-slot-toggle]');if(st){const si=+st.dataset.slotToggle;expandedFormulaSlot=expandedFormulaSlot===si?-1:si;renderSlots();return;}const ds=e.target.closest('[data-del-slot]');if(ds){const si=+ds.dataset.delSlot;formulaSlots.splice(si,1);if(expandedFormulaSlot===si)expandedFormulaSlot=Math.min(si,formulaSlots.length-1);else if(expandedFormulaSlot>si)expandedFormulaSlot-=1;renderSlots();return;}const dc=e.target.closest('[data-del-choice]');if(dc){const [si,ci]=dc.dataset.delChoice.split('-').map(Number);if(formulaSlots[si]?.choices){formulaSlots[si].choices.splice(ci,1);renderSlots();}return;}const pickerToggle=e.target.closest('[data-rmw-picker-toggle]');if(pickerToggle){const panel=$(`[data-rmw-picker-panel="${pickerToggle.dataset.rmwPickerToggle}"]`,slotsWrap),willOpen=panel&&panel.hidden;$$('[data-rmw-picker-panel]',slotsWrap).forEach(entry=>{entry.hidden=true;entry.classList.remove('is-floating');entry.removeAttribute('style');});$$('[data-rmw-picker-toggle]',slotsWrap).forEach(entry=>entry.setAttribute('aria-expanded','false'));if(panel&&willOpen){panel.hidden=false;panel.classList.add('is-floating');pickerToggle.setAttribute('aria-expanded','true');const r=pickerToggle.getBoundingClientRect(),w=Math.min(Math.max(r.width,520),innerWidth-24);panel.style.width=w+'px';panel.style.left=Math.max(12,Math.min(r.left,innerWidth-w-12))+'px';const h=Math.min(panel.scrollHeight,460),below=innerHeight-r.bottom;panel.style.top=(below>=Math.min(h,320)?r.bottom+8:Math.max(12,r.top-h-8))+'px';requestAnimationFrame(()=> $('[data-rmw-picker-search]',panel)?.focus());}return;}const pickerItem=e.target.closest('[data-rmw-picker-item]');if(pickerItem){const si=+pickerItem.dataset.rmwPickerSi,pid=pickerItem.dataset.rmwPickerItem;if(pid&&formulaSlots[si]){formulaSlots[si].choices=formulaSlots[si].choices||[];if(formulaSlots[si].choices.length<20&&!formulaSlots[si].choices.some(choice=>choice.itemId===pid)){formulaSlots[si].choices.push({itemId:pid,extra:0});renderSlots();}}return;}});slotsWrap.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const panel=e.target.closest('[data-rmw-picker-panel]');if(!panel)return;const si=panel.dataset.rmwPickerPanel;panel.hidden=true;const trigger=$(`[data-rmw-picker-toggle="${si}"]`,slotsWrap);trigger?.setAttribute('aria-expanded','false');trigger?.focus();});m.el.addEventListener('click',e=>{if(e.target.closest('.rmw-slot-add-bar'))return;$$('[data-rmw-picker-panel]',slotsWrap).forEach(panel=>{panel.hidden=true;panel.classList.remove('is-floating');panel.removeAttribute('style');});$$('[data-rmw-picker-toggle]',slotsWrap).forEach(trigger=>trigger.setAttribute('aria-expanded','false'));});renderSlots();const archiveBtn=$('[data-archive]',m.el);if(archiveBtn)archiveBtn.onclick=()=>{S().updateItem(x.id,{archived:!x.archived});m.close();render();toast('Menu mis à jour',x.name);};const status=$('[data-media-status]',m.el);$('[data-photo]',m.el).onchange=async e=>{const u=await upload(e.target.files[0],'image',status);if(u){photo=u;video='';}};$('[data-video]',m.el).onchange=async e=>{const u=await upload(e.target.files[0],'video',status);if(u){video=u;photo='';}};$('[data-media-remove]',m.el).onclick=()=>{photo='';video='';status.textContent='Média retiré.';};$('[data-cancel]',m.el).onclick=m.close;const saveItem=(onSuccess)=>{const name=$('[data-name]',m.el).value.trim();if(!name)return;const validSlots=isFormulaCb.checked?formulaSlots.filter(s=>(s.label||'').trim()||(s.choices&&s.choices.length)).map(s=>({id:s.id||'sl_'+Math.random().toString(36).slice(2,6),label:s.label||'Choix',min:s.min!=null?s.min:1,max:s.max!=null?s.max:1,choices:(s.choices||[]).map(c=>({itemId:c.itemId,extra:Math.max(0,+c.extra||0)}))})):[];const p={name,price:+$('[data-price]',m.el).value||0,catId:$('[data-cat]',m.el).value,desc:$('[data-desc]',m.el).value,avail:$('[data-avail]',m.el).value==='1',formulaOnly:!$('[data-standalone]',m.el).checked,archived:!!x?.archived,photo,video,opts:$$('[data-opt]:checked',m.el).map(e=>e.dataset.opt),formula:validSlots.length?{slots:validSlots}:null};x?S().updateItem(x.id,p):S().addItem(p);m.close();render();toast('Menu mis à jour',name);if(typeof onSuccess==='function')onSuccess();};$('[data-save]',m.el).onclick=()=>saveItem();
  }
  function emojiPicker(button){$$('.rmw-emoji-pop').forEach(x=>x.remove());const all=S().optionEmojis?.()||[],p=document.createElement('div'),r=button.getBoundingClientRect();p.className='rmw-emoji-pop';p.innerHTML=`<button data-emoji="" class="rmw-none">Aucun repère</button>${all.map(e=>`<button data-emoji="${esc(e)}">${e}</button>`).join('')}`;p.style.left=Math.min(r.left,innerWidth-390)+'px';p.style.top=Math.min(r.bottom+6,innerHeight-330)+'px';p.onclick=e=>{const b=e.target.closest('[data-emoji]');if(!b)return;button.dataset.value=b.dataset.emoji;button.textContent=b.dataset.emoji||'＋';p.remove();};document.body.appendChild(p);}
  function choiceRow(c){return `<div class="mi-grp-opt-row" data-choice data-id="${c?.id||''}"><button type="button" class="rmw-emoji-btn" data-emoji-btn data-value="${esc(c?.emoji||'')}">${c?.emoji||'＋'}</button><input class="kf-input" data-choice-name placeholder="${esc(ui('addChoicePlaceholder'))}" value="${esc(c?.name||'')}"/><div class="eq-m-suffix"><input class="kf-input" type="number" min="0" data-choice-price value="${+c?.price||0}"/><span class="sfx">MAD</span></div><button class="mi-ic-btn danger" type="button" data-choice-del>${ic('trash')}</button></div>`;}
  function openGroup(g){
    const m=modal({title:g?ui('editGroupTitle'):ui('newGroupTitle'),width:700,body:`<div class="kf-group"><label class="kf-label">${esc(ui('groupNameLabel'))}</label><input class="kf-input" data-name value="${esc(g?.name||'')}" placeholder="${esc(ui('groupNamePlaceholder'))}"/></div><div class="kf-row"><div class="kf-group"><label class="kf-label">${esc(ui('groupTypeLabel'))}</label><select class="kf-input" data-kind><option value="one"${g?.kind!=='many'?' selected':''}>${esc(ui('oneChoice'))}</option><option value="many"${g?.kind==='many'?' selected':''}>${esc(ui('manyChoices'))}</option></select></div><div class="kf-group"><label class="kf-label">${esc(ui('groupRequiredLabel'))}</label><select class="kf-input" data-required><option value="0"${!g?.required?' selected':''}>${esc(ui('groupOptionalOpt'))}</option><option value="1"${g?.required?' selected':''}>${esc(ui('groupRequiredOpt'))}</option></select></div></div><div class="kf-group"><label class="kf-label">${esc(ui('choicesLabel'))}</label><div class="kf-help">Le repère visuel accepte uniquement les emojis Kiwi et apparaît sur le KDS.</div><div data-choices>${(g?.choices||[]).map(choiceRow).join('')||choiceRow(null)}</div><button class="btn-slim" type="button" data-choice-add>${ic('plus')} ${esc(ui('addChoiceBtnLabel'))}</button></div>`,foot:`<button class="kb ghost" data-cancel>${esc(ui('cancelBtn'))}</button><button class="eq-cta-gradient" data-save>${esc(ui('saveBtn'))}</button>`});const wrap=$('[data-choices]',m.el);$('[data-choice-add]',m.el).onclick=()=>wrap.insertAdjacentHTML('beforeend',choiceRow(null));wrap.onclick=e=>{const del=e.target.closest('[data-choice-del]');if(del&&$$('[data-choice]',wrap).length>1)del.closest('[data-choice]').remove();const b=e.target.closest('[data-emoji-btn]');if(b)emojiPicker(b);};$('[data-cancel]',m.el).onclick=m.close;$('[data-save]',m.el).onclick=()=>{const name=$('[data-name]',m.el).value.trim(),rows=$$('[data-choice]',wrap).map(r=>({id:r.dataset.id,name:$('[data-choice-name]',r).value.trim(),price:+$('[data-choice-price]',r).value||0,emoji:$('[data-emoji-btn]',r).dataset.value||''})).filter(x=>x.name);if(!name||!rows.length)return;let id=g?.id;if(g){S().updateOptGroup(id,{name,kind:$('[data-kind]',m.el).value,required:$('[data-required]',m.el).value==='1'});(g.choices||[]).filter(c=>!rows.some(x=>x.id===c.id)).forEach(c=>S().deleteOptChoice(id,c.id));rows.forEach(x=>x.id?S().updateOptChoice(id,x.id,x):S().addOptChoice(id,x.name,x.price,x.emoji));}else{S().addOptGroup(name);id=D().opts.at(-1)?.id;S().updateOptGroup(id,{kind:$('[data-kind]',m.el).value,required:$('[data-required]',m.el).value==='1'});rows.forEach(x=>S().addOptChoice(id,x.name,x.price,x.emoji));}m.close();render();};
  }
  function recipeUnitOptions(value){const api=window.KiwiRestaurantUnits,selected=api?.normalize?.(value,'')||'';return `<option value="">Choisir…</option>${(api?.list?.()||[]).map(unit=>`<option value="${esc(unit.id)}"${unit.id===selected?' selected':''}>${esc(unit.label)}</option>`).join('')}`;}
  function recipeIngredientRow(line,idx){return `<div class="rmw-recipe-ing" data-recipe-ing data-stock-id="${esc(line?.stockId||'')}"><input class="kf-input" list="rmw-stock-ingredients" data-ing-name value="${esc(line?.name||'')}" placeholder="Ingrédient du stock"/><input class="kf-input" type="number" min="0" step="0.001" data-ing-qty value="${+line?.qty||0}" placeholder="0"/><select class="kf-input" data-ing-unit>${recipeUnitOptions(line?.unit)}</select><button class="mi-ic-btn danger" type="button" data-ing-delete aria-label="${esc(ui('delete'))}">${ic('trash')}</button></div>`;}
  function recipeDraft(root,x,api){const inv=api.inventory(venue()),units=window.KiwiRestaurantUnits;return{itemName:x.name,portions:Math.max(1,+$('[data-portions]',root)?.value||1),prepMinutes:Math.max(0,+$('[data-minutes]',root)?.value||0),ingredients:$$('[data-recipe-ing]',root).map(row=>{const name=$('[data-ing-name]',row).value.trim(),hit=inv.find(s=>String(s.id)===row.dataset.stockId)||inv.find(s=>String(s.name).trim().toLowerCase()===name.toLowerCase());return{stockId:hit?.id||'',name,qty:Math.max(0,+$('[data-ing-qty]',row).value||0),unit:units?.normalize?.($('[data-ing-unit]',row).value||hit?.unit,'')||''};}).filter(line=>line.name||line.stockId),steps:$('[data-steps]',root)?.value.split('\n').map(v=>v.trim()).filter(Boolean)||[],note:$('[data-note]',root)?.value||''};}
  function recipeSummary(x,draft,api){const m=api.metrics(x,draft,venue()),price=+x.price||0,gain=m.profit==null?'·':`${m.profit.toFixed(2)} MAD`,actual=m.actualCost==null?'À mesurer':`${m.actualCost.toFixed(2)} MAD`;let cls='neutral',title='Recette à compléter',detail='Ajoutez les quantités et reliez les ingrédients au stock.';if(m.costComplete&&m.actualCost==null){cls='ok';title='Recette chiffrée';detail='Le coût réel se comparera à cette fiche après les premières consommations.';}if(m.actualCost!=null){const gap=Math.abs(m.variancePct||0),bad=gap>15;cls=bad?'danger':gap>5?'warn':'ok';title=bad?'Écart à vérifier':gap>5?'Coût à surveiller':'Coût conforme';detail=`${gap.toFixed(0)} % ${m.variancePct>0?'au-dessus':'sous'} du coût prévu · contrôlez les portions et sorties de stock.`;}return `<div class="rmw-recipe-state ${cls}"><i></i><div><b>${title}</b><span>${detail}</span></div></div><div class="rmw-recipe-costs"><div><span>Prix de vente</span><b>${price.toFixed(2)} MAD</b></div><div><span>Coût théorique</span><b>${m.costComplete?`${m.theoreticalCost.toFixed(2)} MAD`:'À compléter'}</b></div><div><span>Coût observé</span><b>${actual}</b><small>${m.actualCost==null?'Après ventes + suivi stock':`${price?((m.actualCost/price)*100).toFixed(1):0} % du prix`}</small></div><div class="total"><span>${m.actualCost==null?'Marge théorique':'Marge observée'}</span><b>${gain}</b><small>par portion</small></div></div>`;}
  function openRecipe(x){const api=window.KiwiRestaurantRecipes,r=api?.get(x.id,x.name,venue())||{portions:1,prepMinutes:0,ingredients:[],steps:[],note:''},inv=api?.inventory(venue())||[];const rows=r.ingredients.length?r.ingredients:[{stockId:'',name:'',qty:0,unit:''}];const m=modal({title:`Recette · ${esc(t(x.name))}`,desc:`${esc(cat(x.catId)?.name?t(cat(x.catId).name):'')}`+` · ${cash(x.price)} prix de vente`,width:940,body:`<div class="rmw-recipe-editor"><datalist id="rmw-stock-ingredients">${inv.map(s=>`<option value="${esc(s.name)}">${esc(s.unit||'')} · ${cash(s.costPerUnit)}</option>`).join('')}</datalist><div data-recipe-summary>${recipeSummary(x,r,api)}</div><section class="rmw-recipe-section rmw-recipe-composition"><div class="rmw-recipe-section-head"><div><span>Fiche technique</span><h4>Composition</h4><p>Les quantités ci-dessous pilotent le coût, la marge et la consommation du stock.</p></div><div class="rmw-recipe-top"><label><span>Portions</span><input class="kf-input" type="number" min="1" step="1" data-portions value="${r.portions||1}"/></label><label><span>Préparation</span><span class="rmw-recipe-suffix"><input class="kf-input" type="number" min="0" step="1" data-minutes value="${r.prepMinutes||0}"/><b>min</b></span></label></div></div><div class="rmw-recipe-ing-head"><span>Ingrédient</span><span>Quantité / recette</span><span>Unité</span><span></span></div><div data-recipe-ingredients>${rows.map(recipeIngredientRow).join('')}</div><button class="btn-slim rmw-recipe-add" type="button" data-ing-add>+ Ajouter un ingrédient</button>${inv.length?'':'<p class="kf-help">Ajoutez d’abord vos matières premières dans Stock &amp; approvisionnement pour calculer leur coût.</p>'}</section><div class="rmw-recipe-notes"><section class="rmw-recipe-section"><span class="rmw-recipe-kicker">Exécution</span><h4>Étapes de préparation</h4><textarea class="kf-input rmw-textarea" data-steps placeholder="Une étape par ligne">${esc((r.steps||[]).join('\n'))}</textarea></section><section class="rmw-recipe-section"><span class="rmw-recipe-kicker">Transmission</span><h4>Notes d’équipe</h4><textarea class="kf-input rmw-textarea" data-note placeholder="Allergènes, calibrage, dressage…">${esc(r.note||'')}</textarea></section></div></div>`,foot:`<button class="kb ghost" data-cancel>${esc(ui('cancelBtn'))}</button><button class="eq-cta-gradient" data-save>${esc(ui('saveBtn'))}</button>`});m.el.classList.add('rmw-recipe-modal');const wrap=$('[data-recipe-ingredients]',m.el),refresh=()=>{$('[data-recipe-summary]',m.el).innerHTML=recipeSummary(x,recipeDraft(m.el,x,api),api);};m.el.addEventListener('input',e=>{const row=e.target.closest('[data-recipe-ing]');if(row&&e.target.matches('[data-ing-name]')){const hit=inv.find(s=>String(s.name).trim().toLowerCase()===e.target.value.trim().toLowerCase());row.dataset.stockId=hit?.id||'';if(hit&&$('[data-ing-unit]',row))$('[data-ing-unit]',row).value=window.KiwiRestaurantUnits?.normalize?.(hit.unit)||hit.unit||'unité';}refresh();});wrap.onclick=e=>{const del=e.target.closest('[data-ing-delete]');if(!del)return;del.closest('[data-recipe-ing]').remove();if(!wrap.children.length)wrap.insertAdjacentHTML('beforeend',recipeIngredientRow({},0));refresh();};$('[data-ing-add]',m.el).onclick=()=>{wrap.insertAdjacentHTML('beforeend',recipeIngredientRow({},wrap.children.length));$('[data-ing-name]',wrap.lastElementChild).focus();};$('[data-cancel]',m.el).onclick=m.close;$('[data-save]',m.el).onclick=()=>{const draft=recipeDraft(m.el,x,api);if(!draft.ingredients.some(line=>line.qty>0)){toast('Quantités manquantes','Ajoutez au moins un ingrédient avec une quantité.','warn');return;}if(draft.ingredients.some(line=>!line.unit)){toast('Unités manquantes','Choisissez une unité pour chaque ingrédient.','warn');return;}api.save(x.id,draft,venue());m.close();render();toast('Recette enregistrée','Stock et marges mis à jour');};}
  function confirm(title,run,detail='Cette action supprimera définitivement cet élément.'){const m=modal({title,width:440,body:`<p>${esc(detail)}</p>`,foot:`<button class="kb ghost" data-cancel>${esc(ui('cancelBtn'))}</button><button class="kb danger" data-confirm>${esc(ui('delete'))}</button>`});$('[data-cancel]',m.el).onclick=m.close;$('[data-confirm]',m.el).onclick=()=>{run();m.close();render();};}
  let legacyMenuHandler=null;
  function restaurantMenuHandler(){
    /* The sidebar only exposes nav-menu for restaurant venues. Claim the route
     * immediately, even while MenuStore/venue hydration is still in flight, so
     * the legacy renderer can never flash on the first click after login. */
    if(isRestaurant()||document.querySelector('.sidebar nav a[data-nav="menu"]')){show(true);return;}
    if(legacyMenuHandler)return legacyMenuHandler.apply(this,arguments);
  }
  /* ═══════════════ Traductions de la carte (assets/menu-i18n.js) ═══════════════
   * La carte est traduite UNE FOIS par Kiwi AI, entrée par entrée, langue par
   * langue, et seulement pour ce qui manque ou a changé (KiwiMenuI18n.needs) ;
   * le libellé du patron n'est JAMAIS remplacé · la traduction vit à côté
   * (entity.i18n). Déclenchement : automatique 2,5 s après un changement de la
   * carte (import, scan, saisie), et à la main depuis l'onglet « Traductions »
   * où chaque cellule se corrige (une correction n'est plus jamais écrasée).
   * Sans session réelle (démo) : rien ne part sur le réseau. */
  let i18nBusy=false,i18nTimer=0,i18nCooldown=0,i18nProgress='';
  const I18N_BATCH=40;
  const I18N_LANG_NAMES={fr:'Français',ar:'العربية',en:'English'};
  const realSession=()=>{try{return !!(window.KiwiEnv&&window.KiwiEnv.isReal&&window.KiwiEnv.isReal());}catch(_){return false;}};
  function i18nChunks(need){
    const out=[];let cur={cats:[],items:[],opts:[],n:0};
    const push=(k,e,w)=>{if(cur.n&&cur.n+w>I18N_BATCH){out.push(cur);cur={cats:[],items:[],opts:[],n:0};}cur[k].push(e);cur.n+=w;};
    (need.cats||[]).forEach(c=>push('cats',c,1+(c.sub||[]).length));
    (need.opts||[]).forEach(g=>push('opts',g,1+(g.choices||[]).length));
    (need.items||[]).forEach(it=>push('items',it,1));
    if(cur.n)out.push(cur);
    return out;
  }
  function i18nRefreshPanel(){if(tab==='i18n'){const p=$('[data-rmw-panel]');if(p)p.innerHTML=i18nPanel();}}
  async function ensureTranslations(o){
    o=o||{};
    const M=window.KiwiMenuI18n;if(!M||i18nBusy)return;
    if(!realSession()){if(!o.silent)toast(ui('i18nDemo'),'','info');return;}
    if(o.silent&&Date.now()<i18nCooldown)return;
    const d=D();
    if(!d.items.length&&!d.cats.length){if(!o.silent)toast(ui('i18nEmpty'),'','info');return;}
    const need=M.needs(d,M.LANGS,{force:o.force||false});
    const total=M.LANGS.reduce((n,l)=>n+(need[l]?need[l].count:0),0);
    if(!total){if(!o.silent)toast(ui('i18nUpToDate'),'','success');return;}
    i18nBusy=true;let written=0,failed='';
    const slug=venue()||'';
    i18nProgress=ui('i18nBusy',{n:total});i18nRefreshPanel();
    try{
      for(const lang of M.LANGS){
        if(!need[lang]||!need[lang].count)continue;
        for(const chunk of i18nChunks(need[lang])){
          let res=null;
          try{
            res=await fetch('/api/ai/menu-translate',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
              body:JSON.stringify({merchant:slug,targetLang:lang,cats:chunk.cats,items:chunk.items,opts:chunk.opts})});
          }catch(_){failed='network';break;}
          if(res.status===429){failed='quota';break;}
          let data=null;try{data=await res.json();}catch(_){}
          if(!res.ok||!data||!data.ok){failed=(data&&(data.error||data.reason))||'error';break;}
          // Le store écrit entity.i18n et republie la carte (menu-catalog.js → schedulePublish).
          written+=S().setI18n(lang,data,{force:o.force||false})||0;
        }
        if(failed)break;
      }
    }finally{i18nBusy=false;i18nProgress='';}
    if(failed){
      i18nCooldown=Date.now()+(failed==='quota'?6*3600e3:10*60e3);
      if(!o.silent)toast(failed==='quota'?ui('i18nQuota'):ui('i18nError'),'','warn');
    }else if(!o.silent){toast(ui('i18nDone',{n:written}),'','success');}
    if(document.body.classList.contains('page-menu'))render();
  }
  function scheduleAutoTranslate(){
    clearTimeout(i18nTimer);
    i18nTimer=setTimeout(()=>{if(isRestaurant())ensureTranslations({silent:true});},2500);
  }
  function i18nPanel(){
    i18nStyle();
    const M=window.KiwiMenuI18n,d=D();
    if(!M)return `<div class="rmw-empty"><p>${esc(ui('reloadPage'))}</p></div>`;
    const L=M.LANGS,sum=M.summary(d);
    const head=`<div class="rmw-i18n-head"><div><div class="rmw-i18n-title">${esc(ui('i18nTitle'))}</div><p class="rmw-i18n-hint">${esc(ui('i18nHint'))}</p></div><div class="rmw-i18n-acts"><button class="btn-slim" data-action="rmw-i18n-fill"${i18nBusy?' disabled':''}>${esc(ui('i18nFill'))}</button><button class="btn-slim" data-action="rmw-i18n-redo"${i18nBusy?' disabled':''}>${esc(ui('i18nRedo'))}</button></div></div>`;
    const stats=`<div class="rmw-i18n-stats">${L.map(l=>{const s=sum[l];return `<div class="rmw-i18n-stat"><b>${esc(I18N_LANG_NAMES[l])}</b><span>${s.ok+s.manual}/${s.total} ${esc(ui('i18nStatusOk'))}</span>${s.stale?`<span class="is-stale">${s.stale} ${esc(ui('i18nStatusStale'))}</span>`:''}${s.missing?`<span class="is-missing">${s.missing} ${esc(ui('i18nStatusMissing'))}</span>`:''}</div>`;}).join('')}${i18nProgress?`<div class="rmw-i18n-busy"><span class="rmw-i18n-spin" aria-hidden="true"></span>${esc(i18nProgress)}</div>`:''}</div>`;
    const stLabel=(st)=>ui('i18nStatus'+st.charAt(0).toUpperCase()+st.slice(1));
    const cell=(kind,id,sub,e,l,field)=>{
      const x=e.i18n&&e.i18n[l];const st=M.status(e,l);
      const val=x?(field==='desc'?(x.desc||''):(x.name||'')):'';
      return `<td class="st-${st}"><input type="text" data-rmw-i18n data-kind="${kind}" data-id="${esc(id)}" data-sub="${esc(sub||'')}" data-lang="${l}" data-field="${field}" value="${esc(val)}" placeholder="${st==='stale'?esc(stLabel('stale')):''}" title="${esc(stLabel(st))}" dir="${l==='ar'?'rtl':'ltr'}" /></td>`;
    };
    const row=(kind,id,sub,e,mark,field)=>`<tr><td class="rmw-i18n-src">${mark?`<span class="rmw-i18n-kind">${esc(mark)}</span>`:''}${esc(field==='desc'?(e.desc||''):e.name)}</td>${L.map(l=>cell(kind,id,sub,e,l,field||'name')).join('')}</tr>`;
    const rows=[];
    const section=(t)=>rows.push(`<tr class="rmw-i18n-section"><td colspan="${1+L.length}">${esc(t)}</td></tr>`);
    if(d.cats.length){section(ui('i18nSections'));d.cats.forEach(c=>{rows.push(row('cat',c.id,'',c,''));(c.sub||[]).forEach(s=>rows.push(row('sub',c.id,s.id,s,'↳')));});}
    const items=d.items.filter(x=>!x.archived);
    if(items.length){section(ui('i18nItems'));items.forEach(it=>{rows.push(row('item',it.id,'',it,''));if(it.desc)rows.push(row('item',it.id,'',it,ui('i18nDesc'),'desc'));});}
    if((d.opts||[]).length){section(ui('i18nOptions'));d.opts.forEach(g=>{rows.push(row('opt',g.id,'',g,''));(g.choices||[]).forEach(c=>rows.push(row('choice',g.id,c.id,c,'↳')));});}
    if(!rows.length)return head+`<div class="rmw-empty"><p>${esc(ui('i18nEmpty'))}</p></div>`;
    return head+stats+`<div class="rmw-i18n-wrap"><table class="rmw-i18n"><thead><tr><th>${esc(ui('i18nOriginal'))}</th>${L.map(l=>`<th>${esc(I18N_LANG_NAMES[l])}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  function onI18nEdit(input){
    const k=input.dataset;const v=input.value;
    const patch=k.field==='desc'?{desc:v}:{name:v};
    S().setI18nEntry(k.kind,k.id,k.sub||null,k.lang,patch);
    i18nRefreshPanel();
  }
  function i18nStyle(){if($('#rmw-i18n-css'))return;const s=document.createElement('style');s.id='rmw-i18n-css';s.textContent=`
.rmw-i18n-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:0 0 14px}
.rmw-i18n-title{font:650 16px var(--sans);letter-spacing:-.01em;color:var(--ink)}
.rmw-i18n-hint{max-width:70ch;margin:4px 0 0;font-size:12px;line-height:1.45;color:var(--n-500)}
.rmw-i18n-acts{display:flex;gap:8px;flex-wrap:wrap}
.rmw-i18n-stats{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 14px}
.rmw-i18n-stat{display:flex;gap:10px;align-items:baseline;padding:9px 13px;border:1px solid var(--n-200);border-radius:11px;background:var(--surface);font-size:12px;color:var(--n-500)}
.rmw-i18n-stat b{color:var(--ink);font-weight:650}
.rmw-i18n-stat .is-stale{color:#a77617}.rmw-i18n-stat .is-missing{color:#b94b38}
.rmw-i18n-busy{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--atlas)}
.rmw-i18n-spin{width:14px;height:14px;border:2px solid var(--n-200);border-top-color:var(--atlas);border-radius:50%;animation:rmw-spin .8s linear infinite}
.rmw-i18n-wrap{overflow:auto;border:1px solid var(--n-200);border-radius:13px;background:var(--surface)}
table.rmw-i18n{width:100%;border-collapse:collapse;min-width:760px;font-size:12.5px}
table.rmw-i18n th{position:sticky;top:0;z-index:1;padding:10px 12px;text-align:start;font:700 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--n-500);background:var(--paper-soft);border-bottom:1px solid var(--n-200)}
table.rmw-i18n td{padding:4px 8px;border-bottom:1px solid var(--n-200);vertical-align:middle}
table.rmw-i18n tr:last-child td{border-bottom:0}
table.rmw-i18n .rmw-i18n-section td{padding:10px 12px 6px;font:700 10px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--atlas);background:color-mix(in srgb,var(--atlas) 5%,var(--surface))}
table.rmw-i18n .rmw-i18n-src{min-width:180px;max-width:300px;padding-inline-start:12px;color:var(--ink);font-weight:550}
.rmw-i18n-kind{display:inline-block;margin-inline-end:7px;color:var(--n-500);font-weight:500}
table.rmw-i18n input{width:100%;min-width:170px;height:34px;padding:0 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--ink);font:500 12.5px var(--sans)}
table.rmw-i18n input:hover{border-color:var(--n-200)}
table.rmw-i18n input:focus{outline:0;border-color:var(--atlas);background:var(--paper-soft)}
table.rmw-i18n td.st-missing input{background:color-mix(in srgb,#b94b38 6%,transparent)}
table.rmw-i18n td.st-stale input{background:color-mix(in srgb,#a77617 8%,transparent)}
table.rmw-i18n td.st-manual input{border-inline-start:3px solid var(--atlas)}
`;document.head.appendChild(s);}
  function wire(){
    const H=window.Kiwi?.handlers;if(!H)return false;
    H['rmw-tab']=e=>{tab=e.dataset.tab;render();};
    H['rmw-hours-period']=e=>{hoursPeriod=e.dataset.period;render();};
    H['rmw-cat-filter']=e=>{filter=e.dataset.cat;subFilter=null;render();};
    H['rmw-cat-move']=(_e,arg)=>{const[id,delta]=String(arg||'').split('::');S().moveCategory(id,+delta);};
    H['rmw-sub-filter']=e=>{subFilter=e.dataset.sub||null;render();};
    H['rmw-sub-add']=(_e,cid)=>ask(ui('newSubcategoryTitle'),ui('subNamePlaceholder'),'',v=>{S().addSubcategory(cid||filter,v);subFilter=null;});
    H['rmw-sub-rename']=(_e,arg)=>{const[cid,sid]=String(arg||'').split('::'),s=(cat(cid)?.sub||[]).find(x=>x.id===sid);if(s)ask(ui('renameSubcategoryTitle'),ui('newNameLabel'),s.name,v=>S().renameSubcategory(cid,sid,v));};
    H['rmw-sub-delete']=(_e,arg)=>{const[cid,sid]=String(arg||'').split('::'),s=(cat(cid)?.sub||[]).find(x=>x.id===sid),n=D().items.filter(x=>x.catId===cid&&x.subId===sid).length;if(s)confirm(ui('deleteSubcategoryConfirm', { name: s.name }),()=>{S().deleteSubcategory(cid,sid);subFilter=null;},ui('deleteSubcategoryDesc', { n }));};
    H['rmw-classify']=(_e,cid)=>openClassify(cid||filter);
    H['rmw-cat-add']=()=>openCategory(null);
    H['rmw-cat-edit']=(_e,id)=>{const c=cat(id);if(c)openCategory(c);};
    H['rmw-cat-delete']=(_e,id)=>{const c=cat(id),n=D().items.filter(x=>x.catId===id).length;if(c)confirm(ui('deleteCategoryConfirm', { name: c.name }),()=>{S().deleteCategory(id);filter='all';subFilter=null;},ui('deleteCategoryDesc', { n }));};
    H['rmw-item-add']=()=>openItem(null);
    H['rmw-item-edit']=(_e,id)=>openItem(item(id));
    H['rmw-item-more']=(_e,id)=>{openItemMenu=openItemMenu===id?null:id;render();};
    H['rmw-item-avail']=(_e,id)=>{const x=item(id);if(x&&!x.archived)S().updateItem(id,{avail:x.avail===false});};
    H['rmw-item-archive']=(_e,id)=>{const x=item(id);openItemMenu=null;if(x)S().updateItem(id,{archived:!x.archived});};
    H['rmw-item-delete']=(_e,id)=>{const x=item(id);openItemMenu=null;if(x)confirm(ui('deleteItemConfirm', { name: x.name }),()=>S().deleteItem(id));};
    H['rmw-group-add']=()=>openGroup(null);
    H['rmw-group-edit']=(_e,id)=>openGroup(group(id));
    H['rmw-group-delete']=(_e,id)=>{const g=group(id);if(g)confirm(ui('deleteGroupConfirm', { name: g.name }),()=>S().deleteOptGroup(id));};
    H['rmw-station-add']=()=>ask(ui('addStationTitle'),ui('stationNameLabel'),'',v=>S().addStation(v));
    H['rmw-station-edit']=(_e,id)=>ask(ui('renameStationTitle'),ui('stationNameLabel'),station(id)?.name,v=>S().renameStation(id,v));
    H['rmw-station-delete']=(_e,id)=>confirm(ui('deleteStationConfirm', { name: station(id)?.name||ui('stationDefault') }),()=>S().deleteStation(id));
    H['rmw-recipe-edit']=(_e,id)=>{const x=item(id);if(x)openRecipe(x);};
    H['rmw-reactivate']=(_e,id)=>{S().updateItem(id,{avail:true});render();};
    H['rmw-menu-scan']=()=>{if(window.KiwiMenuScan?.open)window.KiwiMenuScan.open({onDone:()=>render()});else window.Kiwi?.toast?.(ui('scanUnavailable'),{type:'warn',desc:ui('reloadPage')});};
    H['rmw-menu-translate']=()=>{tab='i18n';render();};
    H['rmw-i18n-fill']=()=>ensureTranslations({silent:false});
    H['rmw-i18n-redo']=()=>confirm(ui('i18nRedoConfirm'),()=>{S().clearI18n(null,true);ensureTranslations({silent:false,force:true});},ui('i18nRedoDesc'));
    if(H['nav-menu']!==restaurantMenuHandler){legacyMenuHandler=H['nav-menu']||legacyMenuHandler;H['nav-menu']=restaurantMenuHandler;}
    return true;
  }
  document.addEventListener('click',e=>{if(openItemMenu&&!e.target.closest('[data-rmw-menu-root]')){openItemMenu=null;if(document.body.classList.contains('page-menu'))render();}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&openItemMenu){openItemMenu=null;if(document.body.classList.contains('page-menu'))render();}});
  function bind(){document.addEventListener('input',e=>{if(e.target.matches('[data-rmw-search]')){query=e.target.value;const p=$('[data-rmw-panel]');if(p)p.innerHTML=menuPanel();}});document.addEventListener('change',e=>{if(e.target.matches('[data-rmw-route]')){S().setCategoryStation(e.target.dataset.rmwRoute,e.target.value);render();}else if(e.target.matches('[data-rmw-i18n]')){onI18nEdit(e.target);}});document.addEventListener('click',e=>{const a=e.target.closest?.('.sidebar nav a[data-nav="menu"]');if(a&&isRestaurant()){e.preventDefault();show();}},true);}
  function style(){if($('#rmw-css'))return;const s=document.createElement('style');s.id='rmw-css';s.textContent=`@keyframes rmw-spin{to{transform:rotate(360deg)}}.mi-card{position:relative;overflow:visible}.rmw-card-edit-hit{position:absolute;inset:0;z-index:3;width:100%;height:100%;padding:0;border:0;border-radius:inherit;background:transparent;cursor:pointer}.mi-card>:not(.rmw-card-edit-hit){position:relative;z-index:2;pointer-events:none}.rmw-card-menu,.mi-card-acts{z-index:4!important;pointer-events:auto!important}.mi-card button:not(.rmw-card-edit-hit),.mi-card [role="switch"]{pointer-events:auto}.mi-card:has(.rmw-card-edit-hit:focus-visible){outline:3px solid color-mix(in srgb,var(--atlas) 25%,transparent);outline-offset:2px}.rmw-menu-open{z-index:30}.mi-card-top{min-height:42px;padding-inline-end:34px}.mi-card-cat{min-width:0;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-height:1.45}.mi-card-top .mi-tag{flex:0 0 auto;white-space:nowrap}.mi-card-foot>span:first-child{min-width:0;white-space:nowrap}.mi-card-acts{align-items:center}.rmw-card-menu{position:absolute;inset-block-start:12px;inset-inline-end:12px;z-index:5}.rmw-more-btn{width:31px;height:31px;padding:0;border:1px solid transparent;border-radius:9px;background:color-mix(in srgb,var(--surface) 82%,transparent);color:var(--n-500);display:grid;place-items:center;cursor:pointer;transition:background 140ms,border-color 140ms,color 140ms,transform 140ms}.rmw-more-btn:hover,.rmw-more-btn[aria-expanded="true"]{background:var(--paper-soft);border-color:var(--n-300);color:var(--ink)}.rmw-more-btn:active{transform:scale(.94)}.rmw-more-btn svg{width:17px;height:17px}.rmw-action-pop{position:absolute;inset-block-start:38px;inset-inline-end:0;width:174px;padding:6px;display:grid;gap:3px;background:color-mix(in srgb,var(--surface) 92%,transparent);border:1px solid var(--n-200);border-radius:13px;box-shadow:0 18px 48px -16px rgba(0,0,0,.48),0 4px 14px rgba(0,0,0,.14);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);animation:rmw-menu-in 150ms cubic-bezier(.2,.8,.2,1);transform-origin:top right}.rmw-action-pop button{width:100%;min-height:38px;padding:8px 10px;border:0;border-radius:9px;background:transparent;color:var(--ink);display:flex;align-items:center;gap:10px;font:600 12px var(--sans);text-align:start;cursor:pointer;transition:background 120ms,color 120ms}.rmw-action-pop button:hover{background:color-mix(in srgb,var(--atlas) 11%,transparent);color:var(--atlas)}.rmw-action-pop button.danger{color:var(--danger)}.rmw-action-pop button.danger:hover{background:color-mix(in srgb,var(--danger) 12%,transparent)}.rmw-action-pop svg{width:16px;height:16px;flex:0 0 auto}@keyframes rmw-menu-in{from{opacity:0;transform:translateY(-5px) scale(.96)}to{opacity:1;transform:none}}.rmw-slot-card{padding:12px;border:1px solid var(--n-200);border-radius:10px;background:var(--paper-soft);display:grid;gap:8px}.rmw-slot-head{display:flex;gap:8px;align-items:center}.rmw-slot-choice-row{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--surface);border:1px solid var(--n-200);border-radius:8px;font-size:12.5px}.rmw-slot-choice-extra{display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--n-500)}.rmw-empty{text-align:center;color:var(--n-500);padding:34px 18px}.rmw-empty h3{color:var(--ink);margin:0 0 8px}.rmw-empty p{max-width:560px;margin:0 auto 18px;line-height:1.5}.rmw-nfc{margin-top:28px}.rmw-media{width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:10px}.rmw-off{opacity:.58}.rmw-archived{opacity:.68;border-style:dashed}.rmw-standalone{display:flex;align-items:center;gap:8px;font-weight:600}.rmw-standalone input{width:18px;height:18px;accent-color:var(--atlas)}.mi-state-toggle{min-height:30px;padding:5px 9px;border:1px solid var(--n-200);border-radius:999px;background:var(--surface);color:var(--atlas);font:600 10px var(--mono);cursor:pointer}.mi-state-toggle[aria-checked="false"]{color:var(--n-500)}.rmw-archived-group{padding:9px 11px;border:1px dashed var(--n-300);border-radius:10px}.rmw-archived-group summary{cursor:pointer;font-size:12px;color:var(--n-500)}.rmw-archived-group button{margin:7px 5px 0 0;padding:6px 9px;border:1px solid var(--n-200);border-radius:8px;background:var(--paper-soft);color:var(--n-500)}.rmw-routes{display:grid;gap:8px}.rmw-route{display:grid;grid-template-columns:minmax(180px,1fr) minmax(220px,360px);align-items:center;gap:18px;padding:13px;border-bottom:1px solid var(--n-200)}.rmw-route select{border:1px solid var(--n-200);border-radius:10px;padding:10px;background:var(--surface);color:var(--ink)}.rmw-checks{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rmw-checks label{padding:10px;border:1px solid var(--n-200);border-radius:9px}.rmw-media-actions{display:flex;gap:8px;flex-wrap:wrap}.rmw-emoji-btn{width:46px;min-width:46px;border:1px solid var(--n-200);border-radius:10px;background:var(--paper-soft);font-size:22px;cursor:pointer}.rmw-emoji-pop{position:fixed;z-index:100000;width:370px;max-height:310px;overflow:auto;padding:10px;background:var(--surface);border:1px solid var(--n-200);border-radius:14px;box-shadow:0 20px 55px #0003;display:grid;grid-template-columns:repeat(8,1fr);gap:5px}.rmw-emoji-pop button{height:38px;border:0;border-radius:7px;background:transparent;font-size:21px;cursor:pointer}.rmw-emoji-pop .rmw-none{grid-column:1/-1;font:12px var(--sans);border:1px solid var(--n-200)}.rmw-emoji-pop button:hover{background:var(--mint-soft)}.rmw-textarea{min-height:120px}.rmw-hours{display:flex;align-items:flex-end;gap:8px;min-height:170px;overflow:auto;padding:25px 4px 0}.rmw-hour{min-width:34px;display:flex;flex-direction:column;align-items:center;gap:5px;font-size:10px;color:var(--n-500)}.rmw-hour i{width:22px;background:var(--atlas);border-radius:5px 5px 1px 1px}.rmw-hour b{font-size:10px;color:var(--ink)}.rmw-recipe-list{display:grid;gap:8px;margin-top:22px}.rmw-recipe-card{display:grid;grid-template-columns:minmax(180px,1fr) minmax(180px,auto) auto;align-items:center;gap:18px;padding:15px 16px;background:var(--surface);border:1px solid var(--n-200);border-radius:12px}.rmw-recipe-name{font-weight:650;color:var(--ink)}.rmw-recipe-meta,.rmw-recipe-result small{display:block;margin-top:4px;font-size:11.5px;color:var(--n-500)}.rmw-recipe-result{text-align:right}.rmw-recipe-editor{display:grid;gap:14px;color:var(--ink)}.rmw-recipe-state{display:flex;align-items:flex-start;gap:11px;padding:13px 15px;border:1px solid var(--n-200);border-radius:14px;background:var(--paper-soft)}.rmw-recipe-state>i{width:8px;height:8px;margin-top:5px;border-radius:50%;background:var(--n-500);flex:0 0 auto}.rmw-recipe-state>div{display:grid;gap:3px}.rmw-recipe-state b{font-size:13px}.rmw-recipe-state span{font-size:11.5px;line-height:1.45;color:var(--n-500)}.rmw-recipe-state.ok{border-color:color-mix(in srgb,var(--atlas) 30%,var(--n-200));background:color-mix(in srgb,var(--atlas) 6%,var(--surface))}.rmw-recipe-state.ok>i{background:var(--atlas)}.rmw-recipe-state.warn>i{background:#a77617}.rmw-recipe-state.danger>i{background:#b94b38}.rmw-recipe-costs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.rmw-recipe-costs>div{display:grid;align-content:start;gap:5px;min-height:78px;padding:13px 14px;border:1px solid var(--n-200);border-radius:13px;background:var(--surface)}.rmw-recipe-costs span,.rmw-recipe-costs small{color:var(--n-500);font-size:10px}.rmw-recipe-costs b{font-size:16px;line-height:1.2;letter-spacing:-.02em}.rmw-recipe-costs>div.total{border-color:color-mix(in srgb,var(--atlas) 35%,var(--n-200));background:color-mix(in srgb,var(--atlas) 7%,var(--surface));color:var(--atlas)}.rmw-recipe-section{padding:17px;border:1px solid var(--n-200);border-radius:15px;background:var(--surface)}.rmw-recipe-section h4{margin:0 0 12px;font-size:14px}.rmw-recipe-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:16px}.rmw-recipe-section-head>div:first-child>span,.rmw-recipe-kicker{display:block;margin-bottom:5px;color:var(--atlas);font:700 9px var(--mono);letter-spacing:.12em;text-transform:uppercase}.rmw-recipe-section-head h4{margin:0;font-size:16px}.rmw-recipe-section-head p{max-width:52ch;margin:5px 0 0;color:var(--n-500);font-size:11.5px;line-height:1.45}.rmw-recipe-top{display:flex;gap:8px;align-items:flex-start;flex:0 0 auto}.rmw-recipe-top label{display:grid;gap:5px;color:var(--n-500);font:700 9px var(--mono);letter-spacing:.06em;text-transform:uppercase}.rmw-recipe-top input{width:76px;min-height:38px}.rmw-recipe-suffix{display:flex;align-items:center}.rmw-recipe-suffix b{margin-left:-30px;color:var(--n-500);font:500 10px var(--mono);pointer-events:none}.rmw-recipe-ing-head,.rmw-recipe-ing{display:grid;grid-template-columns:minmax(180px,1fr) 150px 130px 38px;gap:8px;align-items:center}.rmw-recipe-ing-head{padding:0 4px 7px;font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--n-500)}.rmw-recipe-ing{margin-bottom:7px}.rmw-recipe-add{width:100%;justify-content:center;margin-top:3px;border-style:dashed}.rmw-recipe-notes{display:grid;grid-template-columns:1fr 1fr;gap:12px}.rmw-recipe-notes .rmw-textarea{min-height:104px}.rmw-recipe-modal .kiwi-modal,.rmw-recipe-modal [role=dialog]{background:var(--paper)}.rmw-recipe-modal .kiwi-modal-body{padding-bottom:18px}.rmw-recipe-modal .kiwi-modal-foot{position:sticky;bottom:0;z-index:2;background:color-mix(in srgb,var(--paper) 94%,transparent);backdrop-filter:blur(10px)}.rmw-performance{display:grid;gap:18px}.rmw-perf-period{padding:8px 13px;border:1px solid var(--n-200);border-radius:999px;background:var(--paper-soft);font-size:12px;color:var(--n-600)}.rmw-perf-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.rmw-perf-kpis>div{display:grid;gap:7px;padding:17px 18px;background:var(--surface);border:1px solid var(--n-200);border-radius:13px}.rmw-perf-kpis span{font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--n-500)}.rmw-perf-kpis b{font-size:24px;letter-spacing:-.03em}.rmw-perf-kpis small{color:var(--n-500)}.rmw-perf-matrix{position:relative;margin-top:26px;padding:0 0 25px 35px}.rmw-perf-plot{position:relative;height:390px;border-left:1px solid var(--n-300);border-bottom:1px solid var(--n-300);background:linear-gradient(90deg,transparent 49.85%,var(--n-200) 50%,transparent 50.15%),linear-gradient(0deg,transparent 49.85%,var(--n-200) 50%,transparent 50.15%),#fff;border-radius:4px 12px 4px 4px}.rmw-perf-y{position:absolute;left:-128px;top:190px;width:290px;transform:rotate(-90deg);text-align:center;font-size:11px;color:var(--n-500)}.rmw-perf-x{text-align:center;margin-top:9px;font-size:11px;color:var(--n-500)}.rmw-perf-caption{text-align:center;margin-top:7px;font-size:11px;color:var(--n-500)}.rmw-perf-v,.rmw-perf-h{position:absolute;z-index:0;background:var(--n-300);opacity:.7}.rmw-perf-v{top:0;bottom:0;width:1px}.rmw-perf-h{left:0;right:0;height:1px}.rmw-perf-label{position:absolute;z-index:0;font:700 12px var(--mono);letter-spacing:.04em;pointer-events:none}.rmw-perf-label small{display:block;margin-top:3px;font:10px var(--sans);letter-spacing:0;color:var(--n-500)}.rmw-perf-label.puzzle{left:18px;top:16px}.rmw-perf-label.star{right:18px;top:16px;text-align:right}.rmw-perf-label.dog{left:18px;bottom:16px}.rmw-perf-label.plow{right:18px;bottom:16px;text-align:right}.rmw-perf-dot{position:absolute;transform:translate(-50%,50%);border:2px solid #fff;border-radius:50%;box-shadow:0 2px 9px #0003;cursor:pointer}.rmw-perf-dot.star{background:#1d9c67}.rmw-perf-dot.plow{background:#d49a25}.rmw-perf-dot.puzzle{background:#357fad}.rmw-perf-dot.dog{background:#cb5238}.rmw-perf-dot>span{display:none;position:absolute;left:50%;bottom:calc(100% + 8px);width:max-content;max-width:240px;transform:translateX(-50%);padding:9px 11px;border-radius:8px;background:#101612;color:#fff;text-align:left;font:11px/1.5 var(--sans);box-shadow:0 8px 24px #0004}.rmw-perf-dot:hover>span,.rmw-perf-dot:focus>span{display:block}.rmw-perf-quads{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.rmw-perf-q{display:grid;gap:8px;padding:16px;background:var(--surface);border:1px solid var(--n-200);border-top:3px solid var(--n-300);border-radius:11px}.rmw-perf-q.star{border-top-color:#1d9c67}.rmw-perf-q.plow{border-top-color:#d49a25}.rmw-perf-q.puzzle{border-top-color:#357fad}.rmw-perf-q.dog{border-top-color:#cb5238}.rmw-perf-q h4{margin:0;font:700 11px var(--mono);letter-spacing:.06em}.rmw-perf-q strong{font-size:21px}.rmw-perf-q p,.rmw-perf-q div{margin:0;font-size:11px;color:var(--n-500);line-height:1.45}.rmw-perf-q div span{display:block;font:9px var(--mono);letter-spacing:.05em;text-transform:uppercase}.rmw-perf-q footer{display:grid;gap:3px;padding-top:9px;border-top:1px solid var(--n-200);font-size:11px}.rmw-perf-q footer b{font-size:14px}.rmw-perf-q footer small{color:var(--n-500)}.rmw-perf-table td small{display:block;margin-top:3px;color:var(--n-500);font-size:10px}.rmw-perf-margin{display:inline-block;padding:4px 7px;border-radius:999px;font-weight:700}.rmw-perf-margin.hi{background:#d9f4e6;color:#14734a}.rmw-perf-margin.mid{background:#fff0c9;color:#8c620a}.rmw-perf-margin.lo{background:#ffe0da;color:#a83b27}.rmw-perf-link{padding:0;border:0;background:none;color:var(--atlas);font:inherit;text-decoration:underline;cursor:pointer}.rmw-item-workspace .kiwi-modal,.rmw-item-workspace [role=dialog],.rmw-item-workspace.kiwi-modal,.rmw-item-workspace[role=dialog]{width:min(1120px,calc(100vw - 24px))!important;max-width:1120px!important;height:calc(100vh - 24px);max-height:940px!important;display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden}.rmw-item-workspace .kiwi-modal-body{min-height:0;overflow:auto;padding-bottom:28px}.rmw-item-workspace .kiwi-modal-foot{position:sticky;bottom:0;z-index:8;border-top:1px solid var(--n-200);background:color-mix(in srgb,var(--paper) 94%,transparent);backdrop-filter:blur(18px);box-shadow:0 -18px 38px -34px rgba(0,0,0,.7)}.rmw-formula-builder{gap:16px!important}.rmw-slot-card{padding:0;border:1px solid var(--n-200);border-radius:18px;background:color-mix(in srgb,var(--surface) 96%,var(--paper-soft));overflow:hidden;box-shadow:0 1px 0 rgba(255,255,255,.04),0 12px 36px -30px rgba(0,0,0,.5)}.rmw-slot-head{display:grid;grid-template-columns:minmax(0,1fr) auto 34px 36px;gap:14px;align-items:end;padding:16px 16px 14px;background:color-mix(in srgb,var(--paper-soft) 72%,transparent);border-bottom:1px solid var(--n-200)}.rmw-slot-title{min-width:0;display:grid;gap:5px}.rmw-slot-kicker{color:var(--atlas);font:700 9px var(--mono);letter-spacing:.12em;text-transform:uppercase}.rmw-slot-title>[data-slot-label]{width:100%;height:36px;padding:0;border:0;border-radius:0;background:transparent;color:var(--ink);font:650 16px var(--sans);box-shadow:none}.rmw-slot-title>[data-slot-label]:focus{outline:0;box-shadow:0 1px 0 var(--atlas)}.rmw-slot-summary{overflow:hidden;color:var(--n-500);font:600 9.5px var(--mono);letter-spacing:.02em;text-overflow:ellipsis;white-space:nowrap}.rmw-slot-card.is-expanded .rmw-slot-summary{color:color-mix(in srgb,var(--atlas) 70%,var(--n-500))}.rmw-slot-bounds{display:flex;gap:4px;padding:4px;border:1px solid var(--n-200);border-radius:13px;background:var(--surface)}.rmw-slot-bounds label{display:grid;grid-template-columns:auto 42px;align-items:center;gap:5px;padding-inline-start:7px;color:var(--n-500);font:700 9px var(--mono);letter-spacing:.06em;text-transform:uppercase}.rmw-slot-bounds input{width:42px;height:32px;padding:0 4px;border:0;border-radius:9px;background:var(--paper-soft);color:var(--ink);font:650 14px var(--sans);text-align:center;box-shadow:none}.rmw-slot-toggle,.rmw-slot-delete{align-self:center;width:34px;height:34px;border-radius:10px}.rmw-slot-toggle svg{width:17px;height:17px;fill:currentColor;transition:transform .16s ease}.rmw-slot-toggle[aria-expanded="true"] svg{transform:rotate(180deg)}.rmw-slot-body[hidden]{display:none}.rmw-slot-choices{display:grid;max-height:272px;overflow:auto;padding:0 16px;scrollbar-width:thin;scrollbar-color:var(--n-300) transparent}.rmw-slot-choice-row{display:grid;grid-template-columns:minmax(0,1fr) auto 34px;gap:12px;align-items:center;min-height:55px;padding:8px 0;border:0;border-bottom:1px solid var(--n-200);border-radius:0;background:transparent}.rmw-slot-choice-row:last-child{border-bottom:0}.rmw-slot-choice-main{min-width:0;display:flex;align-items:center;gap:10px}.rmw-choice-index{width:25px;height:25px;flex:0 0 auto;display:grid;place-items:center;border-radius:8px;background:color-mix(in srgb,var(--atlas) 11%,transparent);color:var(--atlas);font:700 10px var(--mono)}.rmw-choice-name{overflow:hidden;color:var(--ink);font:580 13px var(--sans);text-overflow:ellipsis;white-space:nowrap}.rmw-slot-choice-extra{display:grid;grid-template-columns:auto auto;align-items:center;gap:8px}.rmw-extra-label{color:var(--n-500);font:650 9px var(--mono);letter-spacing:.04em;text-transform:uppercase}.rmw-extra-control{height:34px;display:grid;grid-template-columns:auto 45px auto;align-items:center;gap:3px;padding:0 9px;border:1px solid var(--n-200);border-radius:11px;background:var(--paper-soft);color:var(--n-500);font:600 10px var(--mono)}.rmw-extra-control input{width:45px;height:30px;padding:0;border:0;background:transparent;color:var(--ink);font:650 14px var(--sans);text-align:center;box-shadow:none}.rmw-extra-control input::-webkit-inner-spin-button,.rmw-slot-bounds input::-webkit-inner-spin-button{display:none}.rmw-slot-choice-row>.mi-ic-btn{width:32px;height:32px;border-radius:10px;background:transparent}.rmw-slot-add-bar{position:relative;padding:12px 16px 16px;border-top:1px solid var(--n-200);background:color-mix(in srgb,var(--paper-soft) 55%,transparent)}.rmw-formula-picker-trigger{width:100%;min-height:50px;padding:8px 11px;display:grid;grid-template-columns:34px minmax(0,1fr) 22px;align-items:center;gap:10px;border:1px solid var(--n-200);border-radius:14px;background:var(--surface);color:var(--ink);text-align:start;cursor:pointer;transition:border-color .16s ease,box-shadow .16s ease,background .16s ease}.rmw-formula-picker-trigger:hover,.rmw-formula-picker-trigger[aria-expanded="true"]{border-color:color-mix(in srgb,var(--atlas) 55%,var(--n-200));background:color-mix(in srgb,var(--atlas) 4%,var(--surface));box-shadow:0 0 0 3px color-mix(in srgb,var(--atlas) 10%,transparent)}.rmw-formula-picker-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:11px;background:color-mix(in srgb,var(--atlas) 11%,transparent);color:var(--atlas)}.rmw-formula-picker-trigger svg,.rmw-formula-picker-search svg{width:18px;height:18px;fill:currentColor}.rmw-formula-picker-copy{min-width:0;display:grid;gap:2px}.rmw-formula-picker-copy strong{font:650 13px var(--sans)}.rmw-formula-picker-copy small{overflow:hidden;color:var(--n-500);font-size:10.5px;text-overflow:ellipsis;white-space:nowrap}.rmw-formula-picker-chevron{color:var(--n-500);transition:transform .16s ease}.rmw-formula-picker-trigger[aria-expanded="true"] .rmw-formula-picker-chevron{transform:rotate(180deg)}.rmw-formula-picker{margin-top:8px;overflow:hidden;border:1px solid var(--n-200);border-radius:16px;background:var(--surface);box-shadow:0 18px 44px -30px rgba(0,0,0,.48)}.rmw-formula-picker.is-floating{position:fixed;z-index:100005;max-height:min(460px,calc(100vh - 24px));margin:0;border-radius:18px;box-shadow:0 26px 80px -28px rgba(0,0,0,.78);backdrop-filter:blur(24px);animation:kiwi-picker-in .15s cubic-bezier(.2,.8,.2,1) both}@keyframes kiwi-picker-in{from{opacity:0;transform:translateY(-5px) scale(.985)}to{opacity:1;transform:none}}.rmw-formula-picker[hidden]{display:none}.rmw-formula-picker-search{position:sticky;top:0;z-index:2;padding:10px;border-bottom:1px solid var(--n-200);background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(14px)}.rmw-formula-picker-search label{height:39px;padding:0 11px;display:flex;align-items:center;gap:8px;border:1px solid var(--n-200);border-radius:11px;background:var(--paper-soft);color:var(--n-500)}.rmw-formula-picker-search input{width:100%;height:100%;padding:0;border:0;outline:0;background:transparent;color:var(--ink);font:500 12.5px var(--sans)}.rmw-formula-picker-results{max-height:292px;overflow:auto;padding:5px 7px 8px;scrollbar-width:thin;scrollbar-color:var(--n-300) transparent}.rmw-formula-picker-group{padding:5px 0 0}.rmw-formula-picker-group[hidden],.rmw-formula-picker-option[hidden]{display:none}.rmw-formula-picker-group-title{padding:7px 9px 5px;color:var(--n-500);font:700 9px var(--mono);letter-spacing:.1em;text-transform:uppercase}.rmw-formula-picker-option{width:100%;min-height:46px;padding:7px 9px;display:grid;grid-template-columns:minmax(0,1fr) auto 24px;align-items:center;gap:10px;border:0;border-radius:11px;background:transparent;color:var(--ink);text-align:start;cursor:pointer}.rmw-formula-picker-option:hover,.rmw-formula-picker-option:focus-visible{outline:0;background:color-mix(in srgb,var(--atlas) 10%,transparent)}.rmw-formula-picker-option-copy{min-width:0;display:grid;gap:2px}.rmw-formula-picker-option-copy strong{overflow:hidden;font:600 12.5px var(--sans);text-overflow:ellipsis;white-space:nowrap}.rmw-formula-picker-option-copy small{overflow:hidden;color:var(--n-500);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.rmw-formula-picker-price{color:var(--n-600);font:600 10.5px var(--mono);white-space:nowrap}.rmw-formula-picker-add{width:22px;height:22px;display:grid;place-items:center;border-radius:7px;background:color-mix(in srgb,var(--atlas) 12%,transparent);color:var(--atlas)}.rmw-formula-picker-empty{padding:22px 14px;color:var(--n-500);font-size:11.5px;text-align:center}.rmw-slot-all-chosen,.rmw-slot-empty-notice{margin:0;padding:14px 16px!important;border-top:1px solid var(--n-200);background:color-mix(in srgb,var(--paper-soft) 55%,transparent)}@media(max-width:700px){.rmw-item-workspace .kiwi-modal,.rmw-item-workspace [role=dialog],.rmw-item-workspace.kiwi-modal,.rmw-item-workspace[role=dialog]{width:100vw!important;height:100dvh;max-height:none!important;border-radius:0}.rmw-formula-picker.is-floating{inset:auto 8px 8px!important;width:auto!important;max-height:72dvh}.rmw-slot-head{grid-template-columns:minmax(0,1fr) 34px 34px;align-items:start}.rmw-slot-bounds{grid-column:1/-1;grid-row:2;justify-self:start}.rmw-slot-toggle{grid-column:2;grid-row:1}.rmw-slot-delete{grid-column:3;grid-row:1}.rmw-slot-choice-row{grid-template-columns:minmax(0,1fr) 32px;gap:8px;padding:11px 0}.rmw-slot-choice-extra{grid-column:1;justify-self:start;margin-inline-start:35px}.rmw-slot-choice-row>.mi-ic-btn{grid-column:2;grid-row:1/3}.rmw-extra-label{display:none}.rmw-slot-add-bar{grid-template-columns:1fr}.rmw-slot-add-bar .btn-slim{width:100%;justify-content:center}}@media(max-width:900px){.rmw-perf-kpis{grid-template-columns:1fr}.rmw-perf-quads{grid-template-columns:1fr 1fr}.rmw-perf-plot{height:300px}}@media(max-width:800px){.rmw-route{grid-template-columns:1fr}.rmw-checks{grid-template-columns:1fr}.rmw-recipe-card{grid-template-columns:1fr}.rmw-recipe-result{text-align:left}.rmw-recipe-costs{grid-template-columns:1fr 1fr}.rmw-recipe-section-head{flex-direction:column}.rmw-recipe-ing-head{display:none}.rmw-recipe-ing{grid-template-columns:1fr 90px 90px 38px}.rmw-recipe-top{width:100%}.rmw-recipe-top label{flex:1}.rmw-recipe-notes{grid-template-columns:1fr}.rmw-perf-quads{grid-template-columns:1fr}}`;document.head.appendChild(s);}
  function performanceStyle(){if($('#rmw-performance-css'))return;const s=document.createElement('style');s.id='rmw-performance-css';s.textContent=`
.rmw-perf-matrix{margin-top:24px;padding:0;border:1px solid #151a17;border-radius:18px;background:#080b09;color:#f7faf8;box-shadow:0 22px 50px rgba(4,9,6,.12)}
.rmw-perf-legend{display:flex;align-items:center;gap:8px;min-height:58px;padding:10px 18px;border-bottom:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.015);border-radius:17px 17px 0 0}
.rmw-perf-legend>span{display:flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid rgba(255,255,255,.09);border-radius:999px;color:rgba(255,255,255,.68);font-size:10.5px}
.rmw-perf-legend i{width:7px;height:7px;border-radius:50%;background:var(--perf-color)}
.rmw-perf-legend b{display:grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:rgba(255,255,255,.08);color:#fff;font:600 9px var(--mono)}
.rmw-perf-legend .star{--perf-color:#73f0b2}.rmw-perf-legend .puzzle{--perf-color:#9db8ff}.rmw-perf-legend .plow{--perf-color:#edca73}.rmw-perf-legend .dog{--perf-color:#f28d79}
.rmw-perf-chart{position:relative;padding:30px 28px 27px 58px;background:radial-gradient(circle at 82% 12%,rgba(56,202,132,.11),transparent 34%),radial-gradient(circle at 15% 92%,rgba(157,184,255,.06),transparent 30%)}
.rmw-perf-plot{position:relative;height:390px;border-left:1px solid rgba(255,255,255,.16);border-bottom:1px solid rgba(255,255,255,.16);background:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:25% 25%;border-radius:0 12px 0 0}
.rmw-perf-y{position:absolute;left:-103px;top:210px;width:270px;transform:rotate(-90deg);text-align:center;font:500 9px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.42)}
.rmw-perf-x{text-align:center;margin-top:11px;font:500 9px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.42)}
.rmw-perf-caption{display:flex;align-items:center;justify-content:center;gap:24px;min-height:52px;margin:0;padding:10px 18px;border-top:1px solid rgba(255,255,255,.09);color:rgba(255,255,255,.48);font-size:10px;text-align:left}
.rmw-perf-caption span{display:flex;align-items:center;gap:7px}.rmw-perf-caption span:before{content:'';width:3px;height:3px;border-radius:50%;background:#73f0b2}
.rmw-perf-v,.rmw-perf-h{position:absolute;z-index:0;background:transparent;opacity:.75}.rmw-perf-v{top:0;bottom:0;width:1px;border-left:1px dashed rgba(115,240,178,.32)}.rmw-perf-h{left:0;right:0;height:1px;border-top:1px dashed rgba(115,240,178,.32)}
.rmw-perf-label{position:absolute;z-index:0;pointer-events:none;font:inherit;letter-spacing:0}.rmw-perf-label b{display:block;font:650 10px var(--mono);letter-spacing:.12em;color:rgba(255,255,255,.78)}.rmw-perf-label small{display:block;margin-top:5px;font:10px var(--sans);letter-spacing:0;color:rgba(255,255,255,.34)}
.rmw-perf-label.puzzle{left:16px;top:16px}.rmw-perf-label.star{right:16px;top:16px;text-align:right}.rmw-perf-label.dog{left:16px;bottom:16px}.rmw-perf-label.plow{right:16px;bottom:16px;text-align:right}
.rmw-perf-label.star b{color:#73f0b2}.rmw-perf-label.puzzle b{color:#9db8ff}.rmw-perf-label.plow b{color:#edca73}.rmw-perf-label.dog b{color:#f28d79}
.rmw-perf-dot{--perf-color:#73f0b2;--perf-glow:rgba(115,240,178,.22);position:absolute;transform:translate(-50%,50%);border:2px solid #080b09;border-radius:50%;background:var(--perf-color);box-shadow:0 0 0 1px var(--perf-glow),0 0 18px var(--perf-glow);cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}
.rmw-perf-dot.star{--perf-color:#73f0b2;--perf-glow:rgba(115,240,178,.24)}.rmw-perf-dot.plow{--perf-color:#edca73;--perf-glow:rgba(237,202,115,.22)}.rmw-perf-dot.puzzle{--perf-color:#9db8ff;--perf-glow:rgba(157,184,255,.22)}.rmw-perf-dot.dog{--perf-color:#f28d79;--perf-glow:rgba(242,141,121,.22)}
.rmw-perf-dot:hover,.rmw-perf-dot:focus-visible{transform:translate(-50%,50%) scale(1.18);outline:0;box-shadow:0 0 0 2px #080b09,0 0 0 4px var(--perf-color),0 0 28px var(--perf-glow);z-index:400!important}
.rmw-perf-dot>span{display:none;position:absolute;left:50%;bottom:calc(100% + 13px);width:230px;max-width:none;transform:translateX(-50%);padding:13px 14px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#111713;color:#fff;text-align:left;font:11px/1.45 var(--sans);box-shadow:0 18px 42px rgba(0,0,0,.45)}
.rmw-perf-dot>span:after{content:'';position:absolute;left:calc(50% - 5px);top:100%;border:5px solid transparent;border-top-color:#111713}.rmw-perf-dot>span em{display:block;margin-bottom:5px;color:var(--perf-color);font:500 8.5px var(--mono);font-style:normal;letter-spacing:.12em;text-transform:uppercase}.rmw-perf-dot>span b{display:block;margin-bottom:9px;font-size:13px}.rmw-perf-dot>span small{display:grid;gap:3px;color:rgba(255,255,255,.56)}.rmw-perf-dot>span small i{font-style:normal}.rmw-perf-dot>span strong{display:block;margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.09);color:#fff;font-size:11px}.rmw-perf-dot:hover>span,.rmw-perf-dot:focus-visible>span{display:block}
@media(max-width:900px){.rmw-perf-legend{overflow:auto}.rmw-perf-chart{padding-left:48px}.rmw-perf-plot{height:310px}.rmw-perf-caption{align-items:flex-start;flex-direction:column;gap:6px}}
`;document.head.appendChild(s);}
  function hoursStyle(){if($('#rmw-hours-css'))return;const s=document.createElement('style');s.id='rmw-hours-css';s.textContent=`
.rmw-hours-page{display:grid;gap:18px}.rmw-hours-pills{margin-top:16px}.rmw-hours-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.rmw-hours-kpis>div{display:grid;gap:7px;padding:17px 18px;background:#fff;border:1px solid var(--n-200);border-radius:13px}.rmw-hours-kpis span{font:10px var(--mono);letter-spacing:.07em;text-transform:uppercase;color:var(--n-500)}.rmw-hours-kpis b{font-size:24px;line-height:1.1;letter-spacing:-.03em}.rmw-hours-kpis>div:last-child b{font-size:18px}.rmw-hours-kpis small{color:var(--n-500)}.rmw-hours-list-title{margin:22px 0 12px;color:var(--n-500);font-size:11px}.rmw-hours-bars{display:grid;gap:9px}.rmw-hours-row{display:grid;grid-template-columns:minmax(120px,190px) minmax(180px,1fr) 55px;align-items:center;gap:14px}.rmw-hours-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.rmw-hours-track{height:12px;border-radius:4px;background:var(--n-100);overflow:hidden}.rmw-hours-track i{display:block;height:100%;min-width:3px;border-radius:4px;background:var(--atlas)}.rmw-hours-row>b{text-align:right;font:600 11px var(--mono)}.rmw-hours-insight{padding:22px 24px;border-radius:16px;background:#08100c;color:#fff;box-shadow:0 16px 38px rgba(4,9,6,.10)}.rmw-hours-insight>span{color:#73f0b2;font:600 9px var(--mono);letter-spacing:.12em}.rmw-hours-insight h3{margin:10px 0 7px;font-size:20px}.rmw-hours-insight p{max-width:780px;margin:0;color:rgba(255,255,255,.62);font-size:12px;line-height:1.6}.rmw-hours-notables{display:grid;gap:8px}.rmw-hours-notable{display:flex;gap:11px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--n-200)}.rmw-hours-notable:last-child{border-bottom:0}.rmw-hours-notable>i{width:8px;height:8px;margin-top:5px;border-radius:50%;background:var(--atlas);flex:0 0 auto}.rmw-hours-notable b,.rmw-hours-notable span{display:block}.rmw-hours-notable b{font-size:12.5px}.rmw-hours-notable span{margin-top:4px;color:var(--n-500);font-size:11.5px}@media(max-width:800px){.rmw-hours-kpis{grid-template-columns:1fr}.rmw-hours-row{grid-template-columns:110px minmax(120px,1fr) 42px}.rmw-hours-insight{padding:19px}}
`;document.head.appendChild(s);}
  let booted=false,storeBound=false;
  function boot(){
    if(!window.Kiwi?.handlers){setTimeout(boot,50);return;}
    if(!booted){booted=true;style();performanceStyle();hoursStyle();bind();}
    /* Wire navigation before waiting for MenuStore. This closes the startup
     * window in which venues.js could still send the first click to its old UI. */
    wire();
    /* Existing composed menus are the saved templates: reuse makes an
     * independent copy with the same stages, choices, extras and options, then
     * opens that copy immediately so only its name/price need adapting. */
    window.Kiwi.handlers['rmw-formula-duplicate']=(_e,id)=>{const before=new Set(D().items.map(it=>it.id));S().duplicateItem(id);const copy=D().items.find(it=>!before.has(it.id));if(copy)openItem(copy);};
    window.KiwiRestaurantMenuWorkspace={show,render,isRestaurant};
    if(!S()){setTimeout(boot,50);return;}
    if(!storeBound){storeBound=true;const refresh=()=>{if(document.body.classList.contains('page-menu')&&isRestaurant())render();};S().subscribe(refresh);S().subscribe(scheduleAutoTranslate);window.KiwiSales?.subscribe?.(refresh);window.KiwiRestaurantRecipes?.subscribe?.(refresh);window.KiwiHours?.subscribe?.(refresh);window.KiwiVenue?.subscribe?.(()=>{hoursPeriod=null;if(document.body.classList.contains('page-menu')&&isRestaurant())show();});try{window.addEventListener('kiwi:langchange',()=>{if(document.body.classList.contains('page-menu')&&isRestaurant())render();});}catch(_){}}
    if(document.body.classList.contains('page-menu')&&isRestaurant())show();
  }
  /* The legacy menu initializes at DOMContentLoaded. Waiting for window.load
   * left it visible until every low-priority asset had finished, which is why
   * a restaurant briefly saw the old screen (and sometimes had to revisit the
   * route). Run immediately after the legacy DOMContentLoaded listener, before
   * the first paint, then re-assert the handler at load because venues.js also
   * performs a final compatibility rewire there. */
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('load',boot,{once:true});
})();
