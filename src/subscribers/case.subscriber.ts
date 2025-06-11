import { CaseHistoryAction } from '@common/enums/case.enum'
import { CaseHistory } from '@models/case-history.entity'
import { Case } from '@models/case.entity'
import { EventSubscriber, EntitySubscriberInterface, InsertEvent, UpdateEvent, RemoveEvent } from 'typeorm'

@EventSubscriber()
export class CaseSubscriber implements EntitySubscriberInterface<Case> {
  listenTo() {
    return Case
  }

  private async saveHistory(
    eventManager: any,
    ticketId: string,
    oldData: Record<string, any> | null,
    newData: Record<string, any> | null,
    action: CaseHistoryAction,
  ) {
    const ticketHistoryRepo = eventManager.getRepository(CaseHistory)
    await ticketHistoryRepo.save({
      ticketId,
      oldData,
      newData,
      updatedById: newData.updatedById,
      action,
    })
  }

  async afterInsert(event: InsertEvent<Case>) {
    const ticketId = event.entity?.id
    if (!ticketId) {
      console.error('Insert event missing ticket ID.')
      return
    }
    await this.saveHistory(event.manager, ticketId.toString(), null, event.entity, CaseHistoryAction.CREATE)
  }

  async afterUpdate(event: UpdateEvent<Case>) {
    const ticketId = event.entity?.id
    if (!ticketId) {
      console.error('Update event missing ticket ID.')
      return
    }
    await this.saveHistory(event.manager, ticketId, event.databaseEntity, event.entity, CaseHistoryAction.UPDATE)
  }

  async afterRemove(event: RemoveEvent<Case>) {
    const ticketId = event.entity?.id || event.databaseEntity?.id
    if (!ticketId) {
      console.error('Remove event missing ticket ID.')
      return
    }
    await this.saveHistory(event.manager, ticketId.toString(), event.databaseEntity, null, CaseHistoryAction.DELETE)
  }
}
