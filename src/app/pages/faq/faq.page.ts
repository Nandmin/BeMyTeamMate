import { CommonModule } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslationKey } from '../../i18n/translations';
import { LanguageService } from '../../services/language.service';
import { SeoService } from '../../services/seo.service';

type FaqItem = {
  id: string;
  icon: string;
  questionKey: TranslationKey;
  answerKey: TranslationKey;
  linkKey?: TranslationKey;
};

@Component({
  selector: 'app-faq-page',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoPipe],
  templateUrl: './faq.page.html',
  styleUrl: './faq.page.scss',
})
export class FaqPage {
  private readonly seo = inject(SeoService);
  protected readonly languageService = inject(LanguageService);

  protected readonly faqItems: readonly FaqItem[] = [
    {
      id: 'create-event',
      icon: 'event',
      questionKey: 'faq.item.createEvent.question',
      answerKey: 'faq.item.createEvent.answer',
    },
    {
      id: 'join-group',
      icon: 'group_add',
      questionKey: 'faq.item.joinGroup.question',
      answerKey: 'faq.item.joinGroup.answer',
    },
    {
      id: 'notifications',
      icon: 'notifications',
      questionKey: 'faq.item.notifications.question',
      answerKey: 'faq.item.notifications.answer',
    },
    {
      id: 'rsvp',
      icon: 'done_all',
      questionKey: 'faq.item.rsvp.question',
      answerKey: 'faq.item.rsvp.answer',
    },
    {
      id: 'reschedule',
      icon: 'calendar_today',
      questionKey: 'faq.item.reschedule.question',
      answerKey: 'faq.item.reschedule.answer',
    },
    {
      id: 'elo',
      icon: 'workspace_premium',
      questionKey: 'faq.item.elo.question',
      answerKey: 'faq.item.elo.answer',
    },
    {
      id: 'elo-calculation',
      icon: 'insights',
      questionKey: 'faq.item.eloCalculation.question',
      answerKey: 'faq.item.eloCalculation.answer',
    },
    {
      id: 'more-help',
      icon: 'support_agent',
      questionKey: 'faq.item.moreHelp.question',
      answerKey: 'faq.item.moreHelp.answer',
      linkKey: 'faq.item.moreHelp.link',
    },
  ];

  constructor() {
    effect(() => {
      this.languageService.currentLanguage();
      this.seo.setPageMeta({
        title: this.languageService.t('faq.meta.title'),
        description: this.languageService.t('faq.meta.description'),
        path: '/faq',
      });
    });
  }
}
