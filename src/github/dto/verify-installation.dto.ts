import { IsNumberString, IsOptional, IsString } from 'class-validator';

export class VerifyInstallationDto {
  /** GitHub installation_id query param forwarded from the redirect URL. */
  @IsOptional()
  @IsNumberString()
  installationId?: string;

  /** setup_action forwarded by GitHub ("install" | "update"). */
  @IsOptional()
  @IsString()
  setupAction?: string;
}
