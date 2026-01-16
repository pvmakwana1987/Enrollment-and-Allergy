
import { GoogleGenAI } from "@google/genai";
import { Student, ClassConfig } from "../types";

export const getEnrollmentInsights = async (
  students: Student[], 
  classes: ClassConfig[],
  projectionDate: string
) => {
  // Always use the recommended initialization with the named parameter and direct env access
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Fix: Improved summary logic to focus on class capacities for the model's reasoning
  const classSummary = classes.filter(c => !c.hidden && !c.isSpecial).map(c => {
    return `${c.name} (Max Capacity: ${c.capacity})`;
  }).join(', ');

  const prompt = `
    Analyze school enrollment data for the projection date: ${projectionDate}.
    Class List: ${classSummary}.
    Total Registered Students: ${students.length}.
    
    Context:
    - Sibling relationships (type 'S') should have priority for enrollment if capacity is tight.
    - Friends (type 'F') should ideally progress through classes together.
    - Staff children (isStaffChild) often have guaranteed placement.
    
    As a school management consultant, provide a professional summary of:
    1. Overall capacity health and utilization risks.
    2. Strategic recommendations for classes approaching capacity limits.
    3. One creative suggestion regarding friend group cohesion or staff child placements.
    
    Format as bullet points. Keep it professional and under 150 words.
  `;

  try {
    // Basic Text Task uses gemini-3-flash-preview as per guidelines
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    // Access response.text as a property, not a function
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Could not generate insights at this time due to an API error.";
  }
};
