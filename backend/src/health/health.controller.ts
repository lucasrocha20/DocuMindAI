import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

// Orchestrator liveness probes hit this constantly; they must not be rate limited.
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
