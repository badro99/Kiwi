// Workers AI only. All model identifiers and family prefixes live here.
export const GEMMA_VISION = '@cf/google/gemma-4-26b-a4b-it';
export const QWEN = '@cf/qwen/qwen3-30b-a3b-fp8';
export const GLM_LEGACY = '@cf/zai-org/glm-4.7-flash';
export const GPT_OSS = '@cf/openai/gpt-oss-120b';
export const DEEPSEEK_FLASH = '@cf/deepseek-ai/deepseek-v4.1-flash-1017';
export const WHISPER_TURBO = '@cf/openai/whisper-large-v3-turbo';
export const WHISPER = '@cf/openai/whisper';
export const GLM_PREFIX = '@cf/zai-org/glm-';
export const GEMMA_PREFIX = '@cf/google/gemma-';
export const LLAMA_PREFIX = '@cf/meta/llama-3.2-';
export const CLEF = '@cf/cloudflare/clef';

/* Roles. Routes import these, never a model name, so the next deprecation is
 * one line here. glm-5.3-flash (Cloudflare: planned deprecation 20 Nov 2026)
 * held both primaries until 18 Nov 2026. Measured that day on the routes' own
 * prompts and validators, thinking switched off (_run.js thinkingOff):
 *   text   · 7 cases × 3 passes on reservation, watchdog, menu-rank, campaign,
 *            debrief: Qwen 21/21 (1.7 s, $0.00007/call), Gemma 21/21 (3.1 s,
 *            $0.00009), GLM 5.3 21/21 ($0.00015), GLM 4.7 3/21 ($0.00092);
 *   vision · tools/ai-model-eval.mjs, 6 fixtures × 2: Gemma menus 1.000,
 *            salles 1.000, JSON route 100 %, p50 11 s, $0.00026/photo
 *            (GLM 5.3 $0.00048, Llama 3.2 vision menus 0.250); DeepSeek V4.1
 *            Flash menus and salles 1.000, p50 7 s, fallback only ($0.30/$1.20
 *            per million, three times Gemma). */
/* Qwen 3 30B est retiré par Cloudflare le 20 nov. 2026 : il répond 410
 * « Model has been deprecated ». Chaque appel texte commençait par lui et y
 * laissait sa réservation de neurones sans rien coûter ; le 21 nov. 31 appels
 * avaient porté le compteur du jour à 9 869 pour 374 neurones réellement
 * facturés, et l'assistant photo refusait (429). Gemma prend le texte (21/21
 * ci-dessus, le moins cher), DeepSeek V4.1 Flash le secours (vérifiés le
 * 21 nov. avec reasoning_effort et chat_template_kwargs : 200, JSON, usage).
 * QWEN reste exporté pour l'histoire et les outils d'évaluation, aucune route
 * ne doit l'appeler. */
export const TEXT_PRIMARY = GEMMA_VISION;
export const TEXT_FALLBACK = DEEPSEEK_FLASH;
export const VISION_PRIMARY = GEMMA_VISION;
export const VISION_FALLBACK = DEEPSEEK_FLASH;
/* Documents (bons de livraison, factures fournisseur en photo) : un tableau
 * dense, pas un menu. Mesuré le 20 nov. 2026 sur le vrai BL de La Maison en
 * Vogue (Lahlou Menage, 24 lignes) avec le prompt et le validateur de
 * /api/ai/invoice : Gemma 4 rendait 19 à 20 lignes aux libellés brouillés
 * (1600 et 2400 px) ; DeepSeek V4.1 Flash, réflexion coupée
 * (chat_template_kwargs.thinking=false), 24/24 exact en 7,8 s et 1 705 jetons. */
export const DOCUMENT_VISION_PRIMARY = DEEPSEEK_FLASH;
export const DOCUMENT_VISION_FALLBACK = GEMMA_VISION;
