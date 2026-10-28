import test from 'node:test';
import assert from 'node:assert/strict';
import SwaggerParser from '@apidevtools/swagger-parser';
import { document, rawDocument, validateExamples } from '../openapi-contract.js';
test('OpenAPI 3.1 document validates and all request/response examples match their schemas', async () => {
  await SwaggerParser.validate(structuredClone(rawDocument));
  assert.equal(document.openapi, '3.1.0');
  assert.ok(validateExamples() >= 30);
});
test('OpenAPI documents exactly five business operations with validation and infrastructure errors', () => {
  let business = 0;
  for (const [path, item] of Object.entries(document.paths)) {
    if (!path.startsWith('/api/v1/accounts') && path !== '/api/v1/transfers') continue;
    for (const [method, operation] of Object.entries(item)) {
      if (!['get', 'post'].includes(method)) continue;
      business++;
      for (const status of ['400', '429', '500']) assert.ok(operation.responses[status]);
      if (method === 'post') for (const status of ['413', '415']) assert.ok(operation.responses[status]);
    }
  }
  assert.equal(business, 5);
});
