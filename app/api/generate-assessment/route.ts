import { NextResponse } from "next/server"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  
  export async function POST(req: Request) {
    try {
      const { country, board, classLevel, subject, topic, assessmentType, difficulty, questionCount, learningOutcomes } =
        await req.json()
  
      console.log("Received request:", {
        country,
        board,
        classLevel,
        subject,
        topic,
        assessmentType,
        difficulty,
        questionCount,
        learningOutcomes,
      })
  
      interface LearningOutcome {
        outcome: string;
      }

      let prompt: string = `Generate a ${difficulty} difficulty ${subject} assessment for ${classLevel} students in ${country} following the ${board} curriculum, on the topic of "${topic}" with ${questionCount} questions. The assessment should address the following learning outcomes:\n${(learningOutcomes as string[]).map((outcome: string, index: number) => `${index + 1}. ${outcome}`).join("\n")}\n\n`
  
      switch (assessmentType) {
        case "mcq":
          prompt += `Create multiple-choice questions. For each question, provide 4 options (A, B, C, D) with one correct answer. Format the output as a JSON array of objects, where each object has 'question', 'options' (an array of 4 strings), and 'correctAnswer' (index of the correct option) fields.`
          break
        case "truefalse":
          prompt += `Create true/false questions. Format the output as a JSON array of objects, where each object has 'question' and 'correctAnswer' (boolean) fields.`
          break
        case "fillintheblank":
          prompt += `Create fill-in-the-blank questions. Format the output as a JSON array of objects, where each object has 'question' (with a blank represented by '___'), 'answer' (the correct word or phrase to fill the blank), and 'options' (an array of 4 strings including the correct answer) fields.`
          break
        default:
          throw new Error("Invalid assessment type")
      }
  
      console.log("Generating assessment with prompt:", prompt)
  
      const { text } = await generateText({
        model: openai("gpt-4o"),
        prompt: prompt,
        temperature: 0.7,
        maxTokens: 2000,
      })
  
      console.log("Raw OpenAI response:", text)
  
      // Extract JSON from the response
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        throw new Error("No valid JSON found in the response")
      }
  
      const assessment = JSON.parse(jsonMatch[0])
  
      if (!Array.isArray(assessment)) {
        throw new Error("Invalid assessment format: Expected an array of questions")
      }
  
      console.log("Parsed assessment:", assessment)
  
      // Save the assessment to the database
      const { data, error } = await supabase
        .from("assessments")
        .insert({
          country,
          board,
          class_level: classLevel,
          subject,
          topic,
          assessment_type: assessmentType,
          difficulty,
          questions: assessment,
          learning_outcomes: learningOutcomes,
        })
        .select()
  
      if (error) {
        console.error("Supabase error:", error)
        throw new Error(`Failed to save assessment: ${error.message}`)
      }
  
      console.log("Assessment saved to database:", data)
  
      return NextResponse.json({ assessment, id: data[0].id })
    } catch (error) {
      console.error("Error generating assessment:", error)
      return NextResponse.json(
        {
          error: "Failed to generate assessment",
          details: error instanceof Error ? error.message : 'An unknown error occurred',
          stack: process.env.NODE_ENV === "development" && error instanceof Error ? error.stack : undefined,
        },
        { status: 500 },
      )
    }
  }
  
  // Add a new PUT route to update answers
  export async function PUT(req: Request) {
    try {
      const { id, answers, learningOutcomes } = await req.json()
  
      const { data, error } = await supabase
        .from("assessments")
        .update({ answers, learning_outcomes: learningOutcomes })
        .eq("id", id)
        .select()
  
      if (error) {
        throw error
      }
  
      return NextResponse.json({ success: true, data })
    } catch (error) {
      console.error("Error updating answers:", error)
      return NextResponse.json(
        {
          error: "Failed to update answers",
          details: error instanceof Error ? error.message : 'An unknown error occurred',
          stack: process.env.NODE_ENV === "development" && error instanceof Error ? error.stack : undefined,
        },
        { status: 500 },
      )
    }
  }
  
  