import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './auth/current-user.decorator';
import { MasterplanService } from './masterplan.service';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/pm-masterplan')
export class PmMasterplanController {
  constructor(private masterplan: MasterplanService) {}

  @Get('changes')
  list(@Query('status') status: string | undefined, @Query('assetId') assetId: string | undefined, @CurrentUser() user: any) {
    return this.masterplan.list(user, status, assetId);
  }

  @Post('changes')
  @HttpCode(HttpStatus.OK)
  submit(@Body() body: any, @CurrentUser() user: any) {
    return this.masterplan.submit(user, body);
  }

  @Post('changes/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Body() body: { ids?: string[] }, @CurrentUser() user: any) {
    return this.masterplan.approve(user, body?.ids as string[]);
  }

  @Post('changes/:id/reject')
  @HttpCode(HttpStatus.OK)
  reject(@Param('id') id: string, @Body() body: { reason?: string }, @CurrentUser() user: any) {
    return this.masterplan.reject(user, id, body?.reason);
  }

  @Post('changes/:id/withdraw')
  @HttpCode(HttpStatus.NO_CONTENT)
  withdraw(@Param('id') id: string, @CurrentUser() user: any) {
    return this.masterplan.withdraw(user, id);
  }

  @Get('versions')
  versions(@CurrentUser() user: any) {
    return this.masterplan.versions(user);
  }
}
