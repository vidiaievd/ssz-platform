import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { OutboxRelayService, OUTBOX_RELAY_OPTIONS, type OutboxRelayOptions } from './outbox-relay.service.js';
import { OUTBOX_STORE, type IOutboxStore } from './outbox.types.js';

export interface OutboxModuleOptions extends OutboxRelayOptions {
  /** Concrete IOutboxStore implementation to use. */
  store: IOutboxStore;
}

@Module({})
export class OutboxModule {
  static forRoot(options: OutboxModuleOptions): DynamicModule {
    const storeProvider: Provider = {
      provide: OUTBOX_STORE,
      useValue: options.store,
    };
    const optionsProvider: Provider = {
      provide: OUTBOX_RELAY_OPTIONS,
      useValue: options,
    };

    return {
      module: OutboxModule,
      providers: [storeProvider, optionsProvider, OutboxRelayService],
      exports: [OutboxRelayService],
      global: true,
    };
  }
}
