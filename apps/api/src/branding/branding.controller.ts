import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  type ApiBodyOptions,
  ApiConsumes,
  ApiOkResponse,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { AdministratorOnly, Public } from '../auth/decorators';
import { AssetKindSchema, BrandingDto, BrandingUpdateDto } from './branding.dto';
import { BrandingService, MAX_BRANDING_IMAGE_BYTES } from './branding.service';

const FILE_BODY: ApiBodyOptions = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: { file: { type: 'string', format: 'binary' } },
  },
};
const KIND = {
  name: 'kind',
  enum: AssetKindSchema.options,
} as const;

function kindOf(value: string) {
  const parsed = AssetKindSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Unknown image');
  return parsed.data;
}

@ApiTags('branding')
@Controller('branding')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  /** Public: the login page already wears the identity. */
  @Get()
  @Public()
  @ZodResponse({ status: 200, type: BrandingDto })
  get() {
    return this.branding.present();
  }

  @Patch()
  @AdministratorOnly()
  @ZodResponse({ status: 200, type: BrandingDto })
  update(@Body() data: BrandingUpdateDto) {
    return this.branding.update(data);
  }

  @Get('assets/:kind')
  @Public()
  @ApiParam(KIND)
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'The image', schema: { type: 'string', format: 'binary' } })
  async asset(@Param('kind') kind: string, @Res({ passthrough: true }) response: Response) {
    const { contentType, stream } = await this.branding.readAsset(kindOf(kind));
    response.set({
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      // An SVG opened on its own cannot run anything.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'public, max-age=300',
    });
    return new StreamableFile(stream);
  }

  @Put('assets/:kind')
  @AdministratorOnly()
  @ApiParam(KIND)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BRANDING_IMAGE_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ZodResponse({ status: 200, type: BrandingDto })
  setAsset(@Param('kind') kind: string, @UploadedFile() file?: { buffer: Buffer }) {
    return this.branding.setAsset(kindOf(kind), file);
  }

  @Delete('assets/:kind')
  @AdministratorOnly()
  @ApiParam(KIND)
  @ZodResponse({ status: 200, type: BrandingDto })
  removeAsset(@Param('kind') kind: string) {
    return this.branding.removeAsset(kindOf(kind));
  }
}
