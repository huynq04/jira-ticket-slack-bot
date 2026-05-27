import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

function rawBodySaver(req: any, _res: any, buf: Buffer): void {
  if (buf?.length) {
    req.rawBody = buf.toString('utf8');
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  app.use(json({ verify: rawBodySaver }));
  app.use(urlencoded({ extended: true, verify: rawBodySaver }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const config = app.get(ConfigService);
  await app.listen(config.get<number>('PORT', 3000));
}

void bootstrap();
