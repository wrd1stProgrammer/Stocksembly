/** High-confidence abuse screening. Authorization and tool isolation remain mandatory. */
const OVERRIDE =
  /(?:ignore|disregard|override).{0,45}(?:instructions?|rules?|prompt)|(?:지침|명령|규칙).{0,12}(?:무시|잊)|(?:無視|忽略).{0,15}(?:指示|指令|規則)|(?:指示|指令|規則).{0,15}(?:無視|忽略)|(?:ignora|ignore|ignorar|ignoriere|ignorez).{0,35}(?:instru|reglas|regras|anweisung|règles)/iu;
const SECRET =
  /(?:reveal|show|print|give|dump|expose).{0,55}(?:system prompt|api[ _-]?key|password|access token|environment variables)|(?:비밀번호|시스템\s*프롬프트|api\s*키|계정\s*정보).{0,20}(?:알려|보여|출력|공개)|(?:显示|顯示|提供|教えて|表示).{0,25}(?:密碼|密码|系統提示|系统提示|パスワード|システムプロンプト)|(?:muestra|revela|mostre|revele|zeige|affiche|révèle).{0,35}(?:contraseña|senha|passwort|mot de passe|prompt|clé api)/iu;
const EXECUTION =
  /(?:<script\b|javascript\s*:|\b(?:drop|truncate)\s+table\b|\bunion\s+select\b|\bor\s+['"]?1['"]?\s*=\s*['"]?1|\bcurl\b.{0,100}\|\s*(?:sh|bash)\b)/iu;
const UNRELATED =
  /(?:write|tell|make).{0,15}(?:a joke|a poem|a recipe)|(?:농담|시|요리법).{0,8}(?:써줘|알려줘)|(?:笑話|笑话|レシピ).{0,10}(?:教|寫|写)|(?:escribe|escreva).{0,15}(?:poema|receta|receita)|(?:schreib|écris).{0,15}(?:gedicht|poème)/iu;

export function researchInputSafety(
  value: string,
): "allowed" | "invalid" | "unsafe" | "off_topic" {
  const text = value
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu, "")
    .trim();
  if (
    !/[\p{L}\p{N}]/u.test(text) ||
    [...text].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 && code !== 9 && code !== 10 && code !== 13;
    })
  )
    return "invalid";
  const normalized = text.replace(/\s+/gu, " ");
  if (
    OVERRIDE.test(normalized) ||
    SECRET.test(normalized) ||
    EXECUTION.test(normalized)
  )
    return "unsafe";
  if (UNRELATED.test(normalized)) return "off_topic";
  return "allowed";
}
