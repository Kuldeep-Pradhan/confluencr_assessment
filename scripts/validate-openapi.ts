import SwaggerParser from '@apidevtools/swagger-parser';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

const document = parse(await readFile('docs/openapi.yaml', 'utf8'));
await SwaggerParser.validate(document);
console.log('OpenAPI 3.1 specification is valid.');
