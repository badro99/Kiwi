/* Kiwi · plan-catalog.js · the dashboard's plan picker, in the three app
 * languages. Same tiers, prices and lists as the landing page: the lists are
 * copied from content/landing-pricing.json and tools/plan-catalog-test.mjs
 * fails the build if the two drift apart. Read by interactive.js
 * (`show-plans`); nothing else. Prices: owner, 2026-10-16 and 2026-10-21. */
(function () {
  'use strict';
  window.KiwiPlanCatalog = Object.freeze({
    "fr": {
      "tag": "ABONNEMENTS KIWI",
      "title": "Cinq formules. La vôtre évolue avec votre activité.",
      "desc": "De la caisse simple à l'entreprise sur mesure. Un abonnement, jamais une commission sur vos ventes.",
      "badgeCurrent": "PLAN ACTUEL",
      "badgeReco": "RECOMMANDÉ POUR VOUS",
      "ctaCurrent": "Plan actuel",
      "choose": "Choisir {name}",
      "ultraCta": "Passer à Ultra →",
      "quoteCta": "Demander un devis →",
      "later": "Plus tard",
      "tipReal": "Choisir un palier envoie une demande à l'équipe Kiwi, avec une référence. Elle vous répond par e-mail ; rien ne change ni n'est facturé avant votre accord. Basic, Plus et Pro couvrent un établissement, Ultra en ouvre autant que vous voulez.",
      "tipDemo": "<b>Votre recommandation :</b> ce compte gère 3 établissements (Café Atlas · Maison Mansour · Spa Bahia), au-delà du mono-site de Basic, Plus et Pro. <b>Ultra</b> ouvre les établissements illimités, le multi-pays et l'account manager dédié. Le palier exact se précise lors d'un court échange sur vos besoins.",
      "tiers": {
        "basic": {
          "name": "Basic",
          "price": "150 MAD",
          "unit": "/mois",
          "tagline": "La caisse simple des petits commerces et épiceries",
          "feats": [
            "Caisse avec scan de codes-barres",
            "Suivi du stock",
            "Tickets de caisse",
            "Carnet de crédit client",
            "Rapport journalier",
            "Caisse utilisable hors ligne",
            "Un établissement"
          ]
        },
        "plus": {
          "name": "Plus",
          "price": "300 MAD",
          "unit": "/mois",
          "tagline": "Tout Basic + la gestion de boutique",
          "feats": [
            "Tout Basic",
            "Catalogue par tailles et couleurs",
            "Retours, échanges et avoirs",
            "Promotions et offres",
            "Loyalty+",
            "Fiches clients",
            "Suivi des ventes et des marges",
            "Un établissement"
          ]
        },
        "pro": {
          "name": "Pro",
          "price": "399 MAD",
          "unit": "/mois",
          "tagline": "Tout Plus + la salle, la cuisine et l'équipe",
          "feats": [
            "Tout Plus",
            "Plan de salle interactif",
            "Prise de commande par les serveurs",
            "Écran cuisine",
            "OrderPro Restaurant",
            "Carte multilingue",
            "Lien de réservation",
            "Recettes, ingrédients et coût matière",
            "Accès employés avec permissions",
            "Planning, pointage et paie",
            "Kiwi IQ avancé",
            "Support prioritaire sur WhatsApp",
            "Un établissement"
          ]
        },
        "ultra": {
          "name": "Ultra",
          "price": "1 499 MAD",
          "unit": "/mois",
          "tagline": "Plusieurs établissements, plusieurs pays",
          "feats": [
            "Tout Pro",
            "Établissements illimités",
            "Pilotage multi-établissements",
            "Gestion multi-pays",
            "API entreprise",
            "Account manager dédié"
          ]
        },
        "ultimate": {
          "name": "Ultimate",
          "price": "Sur devis",
          "unit": "",
          "tagline": "Un périmètre sur mesure, pour un besoin qu’aucun palier ne couvre",
          "feats": [
            "Périmètre défini avec vous",
            "Nombre d’appareils et de caissiers convenu ensemble",
            "Fonctionnalités développées pour vous"
          ]
        }
      }
    },
    "en": {
      "tag": "KIWI PLANS",
      "title": "Five plans. Yours grows with your business.",
      "desc": "From a simple till to a bespoke setup. A subscription, never a cut of your sales.",
      "badgeCurrent": "CURRENT PLAN",
      "badgeReco": "RECOMMENDED FOR YOU",
      "ctaCurrent": "Current plan",
      "choose": "Choose {name}",
      "ultraCta": "Move to Ultra →",
      "quoteCta": "Ask for a quote →",
      "later": "Later",
      "tipReal": "Choosing a plan sends a request to the Kiwi team, with a reference. They reply by e-mail; nothing changes and nothing is billed until you agree. Basic, Plus and Pro cover one location, Ultra opens as many as you need.",
      "tipDemo": "<b>Your recommendation:</b> this account runs 3 locations (Café Atlas · Maison Mansour · Spa Bahia), beyond the single site of Basic, Plus and Pro. <b>Ultra</b> opens unlimited locations, several countries and a dedicated account manager. The exact plan is settled in a short conversation about your needs.",
      "tiers": {
        "basic": {
          "name": "Basic",
          "price": "150 MAD",
          "unit": "/month",
          "tagline": "A simple till for small shops and grocers",
          "feats": [
            "Till with barcode scanning",
            "Stock tracking",
            "Sales receipts",
            "Customer credit book",
            "Daily report",
            "Offline till",
            "One location"
          ]
        },
        "plus": {
          "name": "Plus",
          "price": "300 MAD",
          "unit": "/month",
          "tagline": "Everything in Basic + shop management",
          "feats": [
            "Everything in Basic",
            "Catalogue by size and colour",
            "Returns, exchanges and credit notes",
            "Promotions and offers",
            "Loyalty+",
            "Customer records",
            "Sales and margin tracking",
            "One location"
          ]
        },
        "pro": {
          "name": "Pro",
          "price": "399 MAD",
          "unit": "/month",
          "tagline": "Everything in Plus + floor, kitchen and team",
          "feats": [
            "Everything in Plus",
            "Interactive floor plan",
            "Waiter order taking",
            "Kitchen display",
            "OrderPro Restaurant",
            "Multilingual menu",
            "Booking link",
            "Recipes, ingredients and food cost",
            "Employee access with permissions",
            "Scheduling, time tracking and payroll",
            "Advanced Kiwi IQ",
            "Priority support on WhatsApp",
            "One location"
          ]
        },
        "ultra": {
          "name": "Ultra",
          "price": "1 499 MAD",
          "unit": "/month",
          "tagline": "Several locations, several countries",
          "feats": [
            "Everything in Pro",
            "Unlimited locations",
            "Multi-location management",
            "Multi-country management",
            "Enterprise API",
            "Dedicated account manager"
          ]
        },
        "ultimate": {
          "name": "Ultimate",
          "price": "Custom quote",
          "unit": "",
          "tagline": "A bespoke scope, for a need no plan covers",
          "feats": [
            "Scope defined with you",
            "Number of devices and cashiers agreed together",
            "Features developed for you"
          ]
        }
      }
    },
    "ar": {
      "tag": "اشتراكات Kiwi",
      "title": "خمس باقات. باقتك تكبر مع نشاطك.",
      "desc": "من كاشير بسيط إلى حل مصمم حسب الطلب. اشتراك، ولا عمولة على مبيعاتك أبدا.",
      "badgeCurrent": "باقتك الحالية",
      "badgeReco": "موصى بها لك",
      "ctaCurrent": "الباقة الحالية",
      "choose": "اختيار {name}",
      "ultraCta": "الانتقال إلى Ultra ←",
      "quoteCta": "طلب عرض سعر ←",
      "later": "لاحقا",
      "tipReal": "اختيار باقة يرسل طلبا إلى فريق Kiwi مع رقم مرجعي. يرد عليك الفريق بالبريد الإلكتروني، ولا يتغير شيء ولا تصدر أي فاتورة قبل موافقتك. تغطي Basic وPlus وPro منشأة واحدة، وتفتح Ultra ما تشاء من المنشآت.",
      "tipDemo": "<b>توصيتنا لك:</b> يدير هذا الحساب 3 منشآت (Café Atlas · Maison Mansour · Spa Bahia)، أي أكثر من المنشأة الواحدة في Basic وPlus وPro. <b>Ultra</b> تفتح عددا غير محدود من المنشآت، وتعدد البلدان، ومدير حساب مخصصا. تتحدد الباقة المناسبة في حديث قصير حول احتياجاتك.",
      "tiers": {
        "basic": {
          "name": "Basic",
          "price": "150 درهم",
          "unit": "/شهر",
          "tagline": "كاشير بسيط للمحلات الصغيرة والبقالات",
          "feats": [
            "نظام كاشير مع مسح الباركود",
            "تتبع المخزون",
            "إيصالات البيع",
            "دفتر ديون العملاء",
            "تقرير يومي",
            "كاشير يعمل دون اتصال بالإنترنت",
            "منشأة واحدة"
          ]
        },
        "plus": {
          "name": "Plus",
          "price": "300 درهم",
          "unit": "/شهر",
          "tagline": "كل مزايا Basic + إدارة المتجر",
          "feats": [
            "كل مزايا Basic",
            "كتالوج حسب المقاسات والألوان",
            "المرتجعات والاستبدال والإشعارات الدائنة",
            "العروض والتخفيضات",
            "Loyalty+‎",
            "ملفات العملاء",
            "تتبع المبيعات وهوامش الربح",
            "منشأة واحدة"
          ]
        },
        "pro": {
          "name": "Pro",
          "price": "399 درهم",
          "unit": "/شهر",
          "tagline": "كل مزايا Plus + الصالة والمطبخ والفريق",
          "feats": [
            "كل مزايا Plus",
            "مخطط تفاعلي للصالة",
            "تسجيل الطلبات بواسطة النُّدُل",
            "شاشة المطبخ",
            "OrderPro Restaurant",
            "قائمة طعام متعددة اللغات",
            "رابط الحجز",
            "الوصفات والمكونات وتكلفة المواد",
            "دخول الموظفين بصلاحيات محددة",
            "الجداول وتسجيل الحضور والرواتب",
            "Kiwi IQ المتقدم",
            "دعم ذو أولوية عبر WhatsApp",
            "منشأة واحدة"
          ]
        },
        "ultra": {
          "name": "Ultra",
          "price": "1 499 درهم",
          "unit": "/شهر",
          "tagline": "منشآت متعددة وبلدان متعددة",
          "feats": [
            "كل مزايا Pro",
            "عدد غير محدود من المنشآت",
            "إدارة منشآت متعددة",
            "إدارة في بلدان متعددة",
            "واجهة API للمؤسسات",
            "مدير حساب مخصص"
          ]
        },
        "ultimate": {
          "name": "Ultimate",
          "price": "بحسب الطلب",
          "unit": "",
          "tagline": "نطاق مصمم حسب الطلب، لحاجة لا تغطيها أي باقة",
          "feats": [
            "نطاق نحدده معك",
            "عدد الأجهزة والصرافين نتفق عليه معا",
            "خصائص نطورها لك"
          ]
        }
      }
    }
  });
})();
