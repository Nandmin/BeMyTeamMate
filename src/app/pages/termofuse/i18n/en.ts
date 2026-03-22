import { TermOfUseTranslation } from './content';

const en: TermOfUseTranslation = {
  meta: {
    title: 'Terms of Use - BeMyTeamMate',
    description:
      'The terms of use and general conditions of BeMyTeamMate for using the service.',
  },
  html: `
    <header class="terms-header">
      <h1 style="line-height: normal; margin-bottom: 0;">Terms of Use</h1>
      <br />
      <h1>(General Terms and Conditions)</h1>
      <div class="terms-divider" role="presentation"></div>
      <p class="mt-4">
        <strong>Service name:</strong> BeMyTeamMate (Web and Mobile Application)<br />
        <strong>Effective from:</strong> [2026-03-02] (v1.2)
      </p>
    </header>

    <div class="terms-content">
      <section class="terms-section">
        <div class="terms-section-title">
          <h2>Summary</h2>
        </div>
        <ul>
          <li>BeMyTeamMate is a free hobby project style service for organizing sports groups.</li>
          <li>The service is provided on an "as is" basis: errors, outages, and feature changes may occur.</li>
          <li>When you join a group, some of your data, such as your display name and attendance responses, may become visible to other group members.</li>
          <li>The detailed data processing rules are described in the Privacy Policy.</li>
        </ul>
      </section>

      <section class="terms-section">
        <div class="terms-section-title">
          <span class="terms-section-number">1.</span>
          <h2>General provisions</h2>
        </div>
        <p>
          This document sets out the conditions for using the BeMyTeamMate web application (hereinafter: Web App) and
          mobile application (hereinafter: Mobile App). The Website, Web App, and Mobile App are collectively referred
          to as the Service.
        </p>
        <p>
          By using the Service, the visitor or registered user (hereinafter: User) accepts these Terms of Use
          (hereinafter: Terms).
        </p>
      </section>

      <section class="terms-section">
        <div class="terms-section-title">
          <span class="terms-section-number">2.</span>
          <h2>Operator information</h2>
        </div>
        <p>The Service is operated by an individual developer.</p>
        <ul>
          <li><strong>Operator/Developer:</strong> András Németh</li>
          <li>
            <strong>Contact: </strong>
            <a class="terms-link select-none" href="mailto:__CONTACT_EMAIL__">__CONTACT_EMAIL__</a>
          </li>
          <li>
            <strong>Website: </strong>
            <a class="terms-link" href="https://bemyteammate.eu" target="_blank" rel="noreferrer">
              https://bemyteammate.eu
            </a>
          </li>
        </ul>
      </section>

      <section class="terms-section">
        <div class="terms-section-title">
          <span class="terms-section-number">3.</span>
          <h2>Purpose of the Service and main features</h2>
        </div>
        <p>
          The purpose of the Service is to support the organization of recreational sports communities, especially
          through the following features. The list is illustrative.
        </p>
        <ul>
          <li>Group management: group creation, membership management, and roles (for example admin)</li>
          <li>Events and matches: date and time, location, headcount, and attendance responses (for example coming / not coming)</li>
          <li>Team assignment support: team generation / balancing (where available)</li>
          <li>Statistics / ratings: displayed metrics (where available)</li>
          <li>Notifications: in-app and/or push notifications (if enabled by the User)</li>
        </ul>
        <p>
          The Service is provided free of charge as a hobby project and is under continuous development. Accordingly,
          functionality and availability may change from time to time, and the Service may be temporarily suspended.
        </p>
      </section>

      <section class="terms-section">
        <div class="terms-section-title">
          <span class="terms-section-number">4.</span>
          <h2>Registration, account, and access</h2>
        </div>
        <p>Some parts of the Service require registration. The User must:</p>
        <ul>
          <li>keep account credentials confidential,</li>
          <li>report unauthorized access without delay,</li>
          <li>refrain from using another person’s account.</li>
        </ul>
        <p>
          The User is responsible for activities carried out through their account, except where unauthorized access is
          demonstrably caused by a fault of the Service.
        </p>
        <p>
          Minors: a minor User may use the Service only with the consent of their legal representative.
        </p>
      </section>

      <section class="terms-section">
        <div class="terms-section-title">
          <span class="terms-section-number">5.</span>
          <h2>User conduct and prohibited use</h2>
        </div>
        <p>
          The User must use the Service lawfully, in compliance with applicable Hungarian and EU laws, and may not
          infringe the rights of others.
        </p>
        <p>In particular, the following is prohibited:</p>
        <ul>
          <li>unauthorized access, searching for or exploiting security vulnerabilities,</li>
          <li>overloading the Service or using it in an automated abusive manner,</li>
          <li>manipulating data, disrupting or misleading other Users,</li>
          <li>publishing unlawful, threatening, offensive, hateful, harassing, or personality-rights-infringing content,</li>
          <li>unlawfully providing third-party personal data (for example phone number, address, email, likeness) without permission.</li>
        </ul>
      </section>

      <section class="terms-section">
        <div class="terms-section-title">
          <span class="terms-section-number">6.</span>
          <h2>User content and community elements</h2>
        </div>
        <p>
          If the Service allows content to be uploaded or entered (for example group name, description, event data,
          notes, or cover image), the User declares that the content is lawful and that they have the necessary rights
          to publish it.
        </p>
        <p>
          The Operator may remove content that is unlawful or incompatible with the purpose of the Service and may
          restrict access accordingly.
        </p>
        <p>
          The User acknowledges that content uploaded to or entered within a group may be accessed by group members as
          part of the intended operation of the Service.
        </p>
      </section>

      <section class="terms-section">
        <div class="terms-section-title">
          <span class="terms-section-number">7.</span>
          <h2>Group-specific data visibility and permissions</h2>
        </div>
        <p>
          The community (group) features of the Service are designed so that certain data and content are available
          only to members of the given group, while other data may be processed within the Service to the extent
          necessary for its operation.
        </p>

        <div class="terms-subsection">
          <h3>7.1. Data visible within the group</h3>
          <p>
            The User acknowledges that when joining a group, other members of that group may become aware of, in
            particular, the following information (illustrative list):
          </p>
          <ul>
            <li>the User’s displayed name / profile data (as displayed by the Service),</li>
            <li>the User’s group membership,</li>
            <li>data related to events and matches belonging to the group (for example date, location, headcount),</li>
            <li>the User’s attendance responses (for example “coming / not coming / unsure”),</li>
            <li>activity-related data within the group (for example notes attached to an event, where available),</li>
            <li>statistics / summaries displayed by the Service in relation to the group (where available).</li>
          </ul>
        </div>

        <div class="terms-subsection">
          <h3>7.2. Data not public outside the group</h3>
          <p>
            A core principle of the Service is that group-related content and details are not public to Users outside
            the group unless a specific feature of the Service expressly provides otherwise (for example a public group
            presentation page, if introduced later).
          </p>
        </div>

        <div class="terms-subsection">
          <h3>7.3. Group administrator permissions</h3>
          <p>
            In some groups, designated administrator(s) may be entitled, to the extent necessary for operating the
            group, to:
          </p>
          <ul>
            <li>manage group basic data and settings,</li>
            <li>approve or reject membership requests,</li>
            <li>remove group members,</li>
            <li>create, edit, and delete group events,</li>
            <li>remove unlawful content or content that violates community norms within the group (where such functionality is available).</li>
          </ul>
          <p>
            The User acknowledges that the exercise of administrator permissions forms part of the group management
            logic within the Service.
          </p>
        </div>

        <div class="terms-subsection">
          <h3>7.4. Invitations, joining, and leaving and their impact on visibility</h3>
          <p>
            After joining a group, the User may access group content, and the data listed above may become visible to
            other group members.
          </p>
          <br />
          <p>If the User leaves the group or is removed, their access to group content ends.</p>
          <br />
          <p>
            Certain data related to already created group events (for example past attendance responses) may be
            retained in aggregated or logged form to preserve the integrity of group operation, in line with the
            Privacy Policy.
          </p>
        </div>

        <div class="terms-subsection">
          <h3>7.5. Technical limitations and security</h3>
          <p>
            The Operator makes reasonable efforts to ensure that only authorized Users can access group data; however,
            the User acknowledges that for internet-based services complete faultlessness and complete protection
            against intrusion cannot be guaranteed.
          </p>
        </div>
      </section>

      <section class="terms-section">
        <div class="terms-section-title">
          <span class="terms-section-number">8.</span>
          <h2>Disclaimer of liability and absence of warranty</h2>
        </div>
        <p>
          Use of the Service is at the User’s own risk. The Service is provided on an “as is” basis without any
          separate warranty or guarantee.
        </p>
        <p>To the extent permitted by law, the Operator is not liable for:</p>
        <ul>
          <li>outages, malfunction, unavailability, or discontinuation,</li>
          <li>data loss, loss of profit, or indirect damages,</li>
          <li>errors or outages caused by third-party services (for example hosting, authentication, or notification infrastructure).</li>
        </ul>
        <p>
          The User acknowledges that due to the hobby project nature of the Service, the Operator does not undertake
          any service availability obligation.
        </p>
      </section>

      <section class="terms-section">
        <div class="terms-section-title">
          <span class="terms-section-number">9.</span>
          <h2>Modification, limitation, or termination of the Service</h2>
        </div>
        <p>
          The Operator may modify, develop, suspend, limit, or terminate the Service at any time, even without prior
          notice. To the extent permitted by law, such decisions do not give rise to claims for damages.
        </p>
      </section>

      <section class="terms-section">
        <div class="terms-section-title">
          <span class="terms-section-number">10.</span>
          <h2>Intellectual property</h2>
        </div>
        <p>
          Unless stated otherwise, the source code, user interface (UI), design elements, graphic and textual content
          of the Service are the intellectual property of the Operator and are protected by copyright. Copying,
          distributing, or commercially using any part of the Service is permitted only with the Operator’s prior
          written consent.
        </p>
      </section>

      <section class="terms-section">
        <div class="terms-section-title">
          <span class="terms-section-number">11.</span>
          <h2>Data processing</h2>
        </div>
        <p>
          The rules governing the processing of personal data are set out in the Privacy Policy available within the
          Service. The User acknowledges that data processing takes place to the extent necessary for operating the
          Service.
        </p>
        <p>
          When using group features, certain User data (for example displayed name, group membership, attendance
          responses) may become visible to group members; details are set out in the Privacy Policy.
        </p>
      </section>

      <section class="terms-section">
        <div class="terms-section-title">
          <span class="terms-section-number">12.</span>
          <h2>Changes to the Terms</h2>
        </div>
        <p>
          The Operator may unilaterally amend these Terms. The amendment becomes effective upon publication within the
          Service from the Effective date shown above. Continued use of the Service constitutes acceptance of the
          amendments.
        </p>
      </section>

      <section class="terms-section">
        <div class="terms-section-title">
          <span class="terms-section-number">13.</span>
          <h2>Governing law and disputes</h2>
        </div>
        <p>
          These Terms are governed by Hungarian law. The parties will first attempt to resolve disputes amicably. If
          this is unsuccessful, the dispute shall, within the limits permitted by law, fall under the jurisdiction of
          the competent Hungarian court for the Operator’s place of residence.
        </p>
      </section>
    </div>
  `,
};

export default en;
