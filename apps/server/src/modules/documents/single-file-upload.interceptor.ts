import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Request, RequestHandler, Response } from 'express';
import multer, { MulterError } from 'multer';
import { from, type Observable, switchMap } from 'rxjs';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';

const MB = 1_048_576;

/**
 * Reads one file from a multipart request (field `file`) into memory, with
 * the configured size limit enforced while it streams in, so an oversized
 * upload is cut off rather than buffered. No other files are accepted.
 */
@Injectable()
export class SingleFileUploadInterceptor implements NestInterceptor {
  private readonly upload: RequestHandler;
  private readonly maxMb: number;

  constructor(@Inject(ENV) env: Env) {
    this.maxMb = env.UPLOAD_MAX_MB;
    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: env.UPLOAD_MAX_MB * MB,
        files: 1,
        fields: 10,
        parts: 11,
      },
    }).single('file');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const parsed = new Promise<void>((resolve, reject) =>
      this.upload(request, response, (error: unknown) =>
        error ? reject(this.problem(error)) : resolve(),
      ),
    );
    return from(parsed).pipe(switchMap(() => next.handle()));
  }

  private problem(error: unknown) {
    if (error instanceof MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return new PayloadTooLargeException({
          code: 'FILE_TOO_LARGE',
          message: `Files can be up to ${this.maxMb} MB.`,
        });
      }
      return new BadRequestException({
        code: 'UPLOAD_INVALID',
        message: 'Send one file, in the form field "file".',
      });
    }
    return error;
  }
}
