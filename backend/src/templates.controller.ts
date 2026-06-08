import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards, ForbiddenException, ConflictException, NotFoundException, HttpCode, HttpStatus } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CmmsService } from './cmms.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/templates')
export class TemplatesController {
  constructor(
    private prisma: PrismaService,
    private cmms: CmmsService,
  ) {}

  @Get()
  async getAll(@CurrentUser() user: any, @Query('department') department?: string) {
    const where: any = {};
    
    if (user.baseRole !== 'admin' && user.baseRole !== 'manager') {
      where.department = user.department;
    } else {
      if (department) {
        where.department = department;
      }
    }

    const templates = await this.prisma.template.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return templates.map((t) => ({
      ...t,
      checklist: typeof t.checklist === 'string' ? JSON.parse(t.checklist) : t.checklist,
    }));
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    if (user.baseRole !== 'admin' && user.baseRole !== 'manager' && user.baseRole !== 'engineer') {
      throw new ForbiddenException('Insufficient permission to create templates');
    }

    if (user.baseRole === 'engineer' && body.department !== user.department) {
      throw new ForbiddenException('Engineers can only create templates for their own department');
    }

    const existing = await this.prisma.template.findFirst({
      where: {
        name: body.name,
        department: body.department,
      },
    });
    if (existing) {
      throw new ConflictException(`Template with name '${body.name}' already exists in department '${body.department}'`);
    }

    const template = await this.prisma.template.create({
      data: {
        name: body.name,
        department: body.department,
        checklist: JSON.stringify(body.checklist),
        createdBy: user.employeeId,
      },
    });

    await this.cmms.logAction(
      'Created PM Template',
      { id: user.employeeId, name: user.name },
      { id: template.id, name: template.name, isUser: false },
      `${body.department} Shared Asset`,
      'system',
    );

    return {
      ...template,
      checklist: typeof template.checklist === 'string' ? JSON.parse(template.checklist) : template.checklist,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    if (user.baseRole !== 'admin' && user.baseRole !== 'manager' && template.department !== user.department) {
      throw new ForbiddenException('You can only delete templates from your own department');
    }

    await this.prisma.template.delete({ where: { id } });

    await this.cmms.logAction(
      'Deleted PM Template',
      { id: user.employeeId, name: user.name },
      { id: template.id, name: template.name, isUser: false },
      `${template.department} Shared Asset`,
      'system',
    );
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteByNameAndDept(@Body() body: { name: string; department: string }, @CurrentUser() user: any) {
    const template = await this.prisma.template.findFirst({
      where: { name: body.name, department: body.department },
    });
    if (!template) {
      throw new NotFoundException(`Template not found`);
    }

    if (user.baseRole !== 'admin' && user.baseRole !== 'manager' && template.department !== user.department) {
      throw new ForbiddenException('You can only delete templates from your own department');
    }

    await this.prisma.template.delete({ where: { id: template.id } });

    await this.cmms.logAction(
      'Deleted PM Template',
      { id: user.employeeId, name: user.name },
      { id: template.id, name: template.name, isUser: false },
      `${template.department} Shared Asset`,
      'system',
    );
  }
}
