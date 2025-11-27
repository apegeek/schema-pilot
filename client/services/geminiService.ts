import { GoogleGenAI } from "@google/genai";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY not found in environment variables.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const explainSqlScript = async (sqlContent: string, fileName: string): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "API Key not configured. Please check your environment variables.";

  try {
    const prompt = `
      You are an expert Database Administrator. 
      Please analyze the following SQL migration script named "${fileName}".
      
      Provide a concise summary in Markdown format that includes:
      1. **Goal**: What this script achieves.
      2. **Key Changes**: Bullet points of created tables, altered columns, or data inserts.
      3. **Potential Risks**: Are there any destructive operations (DROP, TRUNCATE) or performance concerns (missing indexes on foreign keys)?
      4. **Rollback Strategy**: Suggest how one might reverse this change if needed.

      SQL Content:
      \`\`\`sql
      ${sqlContent}
      \`\`\`
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "No explanation generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Failed to analyze SQL script. Please try again later.";
  }
};