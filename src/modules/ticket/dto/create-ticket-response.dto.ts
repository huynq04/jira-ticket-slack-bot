export class CreateTicketResponseDto {
  success: boolean;
  issueKey: string;
  issueUrl: string;
  summary: string;
  duplicated: boolean;
}
