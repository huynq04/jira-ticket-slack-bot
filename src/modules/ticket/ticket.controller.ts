import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalApiTokenGuard } from '../../common/guards/internal-api-token.guard';
import { CreateTicketRequestDto } from './dto/create-ticket-request.dto';
import { CreateTicketResponseDto } from './dto/create-ticket-response.dto';
import { TicketService } from './ticket.service';

@Controller('internal/tickets')
@UseGuards(InternalApiTokenGuard)
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post('create-from-message')
  createFromMessage(
    @Body() request: CreateTicketRequestDto,
  ): Promise<CreateTicketResponseDto> {
    return this.ticketService.createTicketFromMessage(request);
  }
}
