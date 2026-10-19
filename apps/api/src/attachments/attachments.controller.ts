import {
  Catch,
  Controller,
  Delete,
  type ExceptionFilter,
  Get,
  HttpCode,
  type ArgumentsHost,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  type ApiBodyOptions,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { CurrentCollaborator } from '../auth/decorators';
import { ERROR_STATUS } from '../common/domain-error';
import type { Collaborator } from '../database/schema';
import { AttachmentDto } from './attachments.dto';
import { AttachmentsService, type UploadedFile as Upload } from './attachments.service';

/** The upload size limit is enforced while the file is read; answer like any other rule. */
@Catch(PayloadTooLargeException)
class TooLargeFilter implements ExceptionFilter {
  catch(_: PayloadTooLargeException, host: ArgumentsHost) {
    const statusCode = ERROR_STATUS.ATTACHMENT_TOO_LARGE;
    host.switchToHttp().getResponse<Response>().status(statusCode).json({
      statusCode,
      message: 'The file is larger than the allowed size',
      code: 'ATTACHMENT_TOO_LARGE',
    });
  }
}

const FILE_BODY: ApiBodyOptions = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: { file: { type: 'string', format: 'binary' } },
  },
};

@ApiTags('attachments')
@Controller()
@UseFilters(TooLargeFilter)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('ideas/:number/attachments')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ZodResponse({ status: 201, type: AttachmentDto })
  addToIdea(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('number', ParseIntPipe) number: number,
    @UploadedFile() file?: Upload,
  ) {
    return this.attachments.addToIdea(collaborator, number, file);
  }

  @Post('comments/:id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ZodResponse({ status: 201, type: AttachmentDto })
  addToComment(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Upload,
  ) {
    return this.attachments.addToComment(collaborator, id, file);
  }

  /** Always through the API, so the access check happens on every download. */
  @Get('attachments/:id')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'The file', schema: { type: 'string', format: 'binary' } })
  async download(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { attachment, stream } = await this.attachments.download(collaborator, id);
    const image = attachment.contentType.startsWith('image/');
    response.set({
      'Content-Type': attachment.contentType,
      'Content-Length': String(attachment.size),
      // Only images can be shown in the page; anything else is saved, never rendered.
      'Content-Disposition': `${image ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=3600',
    });
    return new StreamableFile(stream);
  }

  @Delete('attachments/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.attachments.remove(collaborator, id);
  }
}
