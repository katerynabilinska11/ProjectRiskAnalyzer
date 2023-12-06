import express from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import z from "zod";
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from "langchain/prompts";
import { RunnableSequence } from "langchain/schema/runnable";
import { StructuredOutputParser } from "langchain/output_parsers";

import { config } from "dotenv";
config();

const app = express();
const port = 3000;


const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Project Risk Analyzer API',
            version: '1.0.0',
        },
    },
    apis: ['./index.js'],
};
const specs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

app.use(express.json());
app.use(express.text());

/**
 * @swagger
 * /formatJson:
 *   post:
 *     summary: Formats plain text to correct json string
 *     requestBody:
 *       content:
 *         text/plain:
 *           schema:
 *               type: string
 *     responses:
 *       200:
 *         description: Successfully converted plain text to json
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 */
app.post('/formatJson', (req, res) => {
    const text = req.body;
    res.json(text);
});

/**
 * @swagger
 * /analyze:
 *   post:
 *     summary: Analyzes project-related text and determines key risk points
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               openAIApiKey:
 *                 type: string
 *               projectDescription:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successfully analyzed project description
 *         content:
 *           application/json:
 *             example:
 *               summary: "summary"
 *               risks: "risks"
 *               ragStatus: "status"
 */
app.post('/analyze', (req, res) => {
    try {
        const { openAIApiKey, projectDescription } = req.body;

        checkDescriptionLength(projectDescription);
         
        const llm = new OpenAI({
            openAIApiKey: openAIApiKey ?? process.env.OPENAI_API_KEY,
        });

        const parser = StructuredOutputParser.fromZodSchema(
            z.object({
                summary: z.string().describe("summarize project description in 10 sentences maximum"),
                risks: z
                    .array(z.string())
                    .describe("highlight key risk areas"),
                ragStatus: z.string().describe("determine the appropriate RAG status based on the complexity of the project described in the text, just write the color"),
            })

        );

        const promptTemplate = PromptTemplate.fromTemplate(
            "Analyze project description as best as possible.\n{formatInstructions}\n{projectDescription}"
        );

        const chain = RunnableSequence.from([
            promptTemplate,
            llm,
            parser,
        ]);

        chain.invoke({
            projectDescription: projectDescription,
            formatInstructions: parser.getFormatInstructions(),
        }).then(response => {
            res.json(response)
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

function checkDescriptionLength(input, wordsCount = 500){
  if(countWords(input) < wordsCount){
    throw new Error(`Amount of words in the description should be bigger than ${wordsCount}`);
  }
}

function countWords(input) {
  input = input.trim();
  var words= input.split(/\s+/);
  words = words.filter(function(word) {
      return word.length > 0;
  });
  var wordCount = words.length;
  return wordCount;
}

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}/api-docs`);
});