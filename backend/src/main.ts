import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { generateHtmlDocs } from './swagger-html.template';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('CMMS API')
    .setDescription(
      'The Computerized Maintenance Management System (CMMS) API documentation',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Write Swagger JSON file to disk for easy Postman import
  const outputPath = path.resolve(process.cwd(), 'swagger.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf8');
  console.log(`Swagger OpenAPI spec written to ${outputPath}`);

  // Write Swagger HTML file to disk for easy frontend browsing
  const htmlOutputPath = path.resolve(process.cwd(), 'api-docs.html');
  fs.writeFileSync(htmlOutputPath, generateHtmlDocs(document), 'utf8');
  console.log(`Swagger HTML documentation written to ${htmlOutputPath}`);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Server is running on http://localhost:${port}`);
  console.log(
    `Swagger documentation is available on http://localhost:${port}/api/docs`,
  );
  console.log(
    `Swagger JSON is available on http://localhost:${port}/api/docs-json`,
  );
}
bootstrap();
