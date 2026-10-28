import SwaggerParser from '@apidevtools/swagger-parser';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { Ajv2020 } from 'ajv/dist/2020.js';
import * as addFormatsModule from 'ajv-formats';
import assert from 'node:assert/strict';

interface Media {
  schema?: object;
  example?: unknown;
  examples?: Record<string, { value: unknown }>;
}
interface Operation {
  responses: Record<string, { content?: Record<string, Media> }>;
  requestBody?: { content: Record<string, Media> };
}
interface ApiDocument {
  openapi: string;
  paths: Record<string, Record<string, Operation>>;
}
export const rawDocument = parse(await readFile(new URL('../docs/openapi.yaml', import.meta.url), 'utf8'));
export const document = await SwaggerParser.dereference(structuredClone(rawDocument)) as unknown as ApiDocument;
const ajv = new Ajv2020({ strict: false, allErrors: true });
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ?? addFormatsModule) as (instance: Ajv2020) => void;
addFormats(ajv);
export function assertMatches(path: string, method: string, status: number, body: unknown): void {
  const schema = document.paths[path]?.[method]?.responses[String(status)]?.content?.['application/json']?.schema;
  assert.ok(schema, `Undocumented response: ${method.toUpperCase()} ${path} ${status}`);
  const validate = ajv.compile(schema);
  assert.ok(validate(body), `${path} ${status}: ${JSON.stringify(validate.errors)}`);
}
export function validateExamples(): number {
  let count = 0;
  for (const path of Object.values(document.paths)) {
    for (const [method, operation] of Object.entries(path)) {
      if (!['get', 'post'].includes(method)) continue;
      const contents = [operation.requestBody?.content, ...Object.values(operation.responses).map(response => response.content)];
      for (const content of contents) {
        for (const media of Object.values(content ?? {})) {
          if (!media.schema) continue;
          const examples = [media.example, ...Object.values(media.examples ?? {}).map(example => example.value)].filter(value => value !== undefined);
          const validate = ajv.compile(media.schema);
          for (const example of examples) {
            assert.ok(validate(example), `OpenAPI example does not match its schema: ${JSON.stringify(validate.errors)}`);
            count++;
          }
        }
      }
    }
  }
  return count;
}
