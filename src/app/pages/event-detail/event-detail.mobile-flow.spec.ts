import { signal } from '@angular/core';
import { EventDetailPage } from './event-detail.page';
import { MatchFlowStep } from './match-flow-step.enum';

describe('EventDetailPage mobile flow state machine', () => {
  function createPage(hasTeams = false) {
    const page = Object.create(EventDetailPage.prototype) as EventDetailPage & any;
    page.currentStep = signal<MatchFlowStep>(MatchFlowStep.Overview);
    page.flowStepOrder = [
      MatchFlowStep.Overview,
      MatchFlowStep.Teams,
      MatchFlowStep.Record,
      MatchFlowStep.FeedbackMvp,
    ] as const;
    page.hasTeamsReady = signal(hasTeams);
    page.modalService = {
      alert: jasmine.createSpy('alert').and.resolveTo(undefined),
    };

    return page;
  }

  it('blocks Record step when teams are not ready', async () => {
    const page = createPage(false);

    await page.goToStep(MatchFlowStep.Teams);
    expect(page.currentStep()).toBe(MatchFlowStep.Teams);

    await page.goToStep(MatchFlowStep.Record);
    expect(page.currentStep()).toBe(MatchFlowStep.Teams);
    expect(page.modalService.alert).toHaveBeenCalled();
  });

  it('allows Overview -> Teams -> Record -> Feedback and back navigation', async () => {
    const page = createPage(true);

    await page.goToStep(MatchFlowStep.Teams);
    await page.goToStep(MatchFlowStep.Record);
    await page.goToStep(MatchFlowStep.FeedbackMvp);
    expect(page.currentStep()).toBe(MatchFlowStep.FeedbackMvp);

    page.goToPreviousStep();
    expect(page.currentStep()).toBe(MatchFlowStep.Record);

    page.goToPreviousStep();
    expect(page.currentStep()).toBe(MatchFlowStep.Teams);

    page.goToPreviousStep();
    expect(page.currentStep()).toBe(MatchFlowStep.Overview);
  });

  it('moves to Feedback step after successful save in mobile flow', async () => {
    const page = createPage(true);
    page.currentStep.set(MatchFlowStep.Record);
    page.saveResults = jasmine.createSpy('saveResults').and.resolveTo(true);

    await page.onMobileRecordSaveAndContinue();

    expect(page.saveResults).toHaveBeenCalled();
    expect(page.currentStep()).toBe(MatchFlowStep.FeedbackMvp);
  });

  it('keeps current step when save is not successful', async () => {
    const page = createPage(true);
    page.currentStep.set(MatchFlowStep.Record);
    page.saveResults = jasmine.createSpy('saveResults').and.resolveTo(false);

    await page.onMobileRecordSaveAndContinue();

    expect(page.currentStep()).toBe(MatchFlowStep.Record);
  });

  it('starts on Overview after re-creation (refresh behavior)', async () => {
    const firstPage = createPage(true);
    await firstPage.goToStep(MatchFlowStep.Teams);
    expect(firstPage.currentStep()).toBe(MatchFlowStep.Teams);

    const refreshedPage = createPage(true);
    expect(refreshedPage.currentStep()).toBe(MatchFlowStep.Overview);
  });
});
