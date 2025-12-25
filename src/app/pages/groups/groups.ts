import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-groups',
  imports: [CommonModule, RouterLink],
  templateUrl: './groups.html',
  styleUrl: './groups.scss',
})
export class GroupsPage {
  groups = [
    {
      id: 1,
      name: 'Esti Foci Szerda',
      description: 'Heti rendszerességű kispályás foci a Margitszigeten. Hozd a formád!',
      image:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCFYMFT9vActKLU96tGhLj1MdCPuH6EYCrw1z_LElLGNYU-ufq8hljlan0YPGbRNs0rNBXV2hdeusdCKRV3faehS8CcKOUYtJ8-GgsU34LelvTMyzdI065n3w7KSQ4uotgRD3grgckHxun5DE6XJGk7lJSDjrt60kiwIVMRYacINvHvIF9MhGSsDh_7VYFPmMh9UR01NwCvw4Y2RqwjZn2XQYjO4byYZOa3Lupst5ZZwhLkzErYrozWKv1q_Zna05YDSH4UmjbAccY',
      isAdmin: true,
      memberCount: 12,
      lastActive: '2 napja',
      members: [
        {
          name: 'User 1',
          avatar:
            'https://lh3.googleusercontent.com/aida-public/AB6AXuA2GjC3dJvTsWj0JEcz_QuNEKlqIqCebb78cEfZ_ipeA8gzdjts1RZLM4oIuCgwBgsANxEUc8C_v6adWs2nLw_8jqYWaB9OMVRUH_2xhcJxExQE7Ec1nXuFn6JdzWhI2mK-w1_yp1Rozg1RTY9Bfsh2HXBFBP0_PS7kH9TiG871z_nL9lhrpQ9IPVtTFi2-9nzCUkwBCLNwTp1KS_N0McNHogegFwicbC7s24ztsRsec5nI1Tx34M95WF4Xr5jpmEAueLoD2utoImU',
        },
        {
          name: 'User 2',
          avatar:
            'https://lh3.googleusercontent.com/aida-public/AB6AXuA9i2-f0ryF_hQrKwNQhua8oizaXfJF63oDFm-ZU9YErjTiDoBUVfdwtfvd6dnC3RBlFqUuN0FPQGi_Tqz2-Sfd46ke2iErP35TY2h7CT7zvkUokIH96G3RIRZWJrdLCts0y8ZFP6V11aWYoMifjujsFqxzvsozKiqA6SeTI4nHOWfIjf_hYKHirlootWEMxd-hiHFbV4xTh3gL02KpxgmuCSDY1qExikyhiBVaXsrNRZSHDvOJXSYFGQ4kCqb79zaeLCeSJt7pLVw',
        },
        {
          name: 'User 3',
          avatar:
            'https://lh3.googleusercontent.com/aida-public/AB6AXuBNS76Ymde7ymO1RFXjThy2QhE_JJzBXzfhj6_GzspT791RMVMV9PXF_LV4uE0Wy6FhzT8I5uo-nZwl4CgE6kWF-wUM0wgDitOpQrbLOm1k8OJU3FqKas6UkYU4xk-wyYguTI8-VNSjVE4symhs7AceQrW3AEOz5ePIiJONLI3PeKG5ifUsHNiXvRrCyxNTBNUjR4cLAxhBlEa0sGSCwK_N54eYZkhmOOZpmnc8VwCFG8QysWKqhHaQHfjCtTpPSCj6VvcKNaiJcMI',
        },
      ],
    },
    {
      id: 2,
      name: 'Hétvégi Kosarasok',
      description: 'Laza dobálgatás hétvégente a suli udvaron. Kezdőket is várunk!',
      image:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuDVB1YNebpGUDWQaTC_n8x4ygrJvr9hMIIlVIvWAnrytM6hBxIBSkBgMNEUNnH_M700BzVfpAg-qzfqz6zeDhuHOb8Ej9gWGFwMe9I3ByyycGrdnmLIXOhagvXXT1y5qBmFpmV3IHEhPYFL9UPWjp2EvSNNWhQsnKoeWyPwrWZvqBpI_6j5VpMjdQ3d7VWgg0gXrVqhYyAzegvvY1hsohNOIWumPBDeABobVHOoELdIaJ6H3A22_y1n60EL_v5yoRE73iP2YP7Wyro',
      isAdmin: false,
      memberCount: 6,
      lastActive: 'Ma',
      members: [
        {
          name: 'User 4',
          avatar:
            'https://lh3.googleusercontent.com/aida-public/AB6AXuBWTIBTYRmRoWGncucupTMwb73GRpR8dMXJsDr-yf16EJcNVpb3DICt3FcrdVAT_4iefmBikkBXR-YorkqQ-NBrzabiEyVHiRf5iVFQEg2mbRDvi6tIjsUiGUDoXCRsvFDXxNeezRmMXtjjNoMQPNly5HdENftLqckp3O7KDWzDcCWRzJniUZ3K1PAYz_KQFN2dQ--omDgmORyWfh6FVmA5ZU4qt0m2JCNOPFv_kUnwGlvlia154UHtOmIsW-SItLJl7mSdWPpfulY',
        },
        {
          name: 'User 5',
          avatar:
            'https://lh3.googleusercontent.com/aida-public/AB6AXuBakp2OaN-RYbQOlOpWE_sAiCfBTxArAHd0n64QOEWXi3j8zBkI4f5lkE7ftYBxieDXI5Z2AgECTczzTY_pcwv875W7o5w51utcSLp0_4MQ2w5sjfxiB2Nt2EMXQyPrd9SRwo_VL08dAaru3DLJbWhaJHU9JzZbulfXaie9AMqqqmeBtsJxy_c2EnAmWHPxKSZ2o8Liv74yK76CiQwDOqYSEy08yUGZL-u831UIVjqEGC4xVlrG3SMfcLfmXMH0AIMR21PHuzxo2wk',
        },
      ],
    },
    {
      id: 3,
      name: 'Reggeli Úszók',
      description: 'Korán kelők klubja. Uszoda bérlet kötelező!',
      image:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuAIf6g1qZYOCsuhIUVzYxm-QrI9t0dzTIYIoOJC54EQ5looiqxHOuP9mAE2IKR8JKG7Xr2uSG5WVYdbkfvRZQbha3jiQkfpJA-OiquS6ngFG0swQ-Uuc-Zf1yRRUQhFEDJzbbLmmHNX-K_R1sfE2OzFfs_HLmEXVWn-G9MhAY24gR_diZCWuYB8_OVDSPusRWTy2QUTzC3WZuJUcCJC73dOvajOEwmpr_2cvkbTeHgL9eXrj2MB_teKVFFJjHfAi6gKA0WBVwM4d-o',
      isAdmin: false,
      memberCount: 2,
      lastActive: '5 napja',
      members: [
        {
          name: 'User 6',
          avatar:
            'https://lh3.googleusercontent.com/aida-public/AB6AXuAmLfBa3hUB9eEITnsgQiJJs_5wQdxFYWaDLTP1RzwwuZuNugcPrHkTwiVeETU2r4gM0VhNUkZWcBBNZZW5td8upK53iYBi9wjNvfJFxP3KYmGq3MY6c1Bf1mi5KNQ_pIoQefCDPrvCVjcjTLjJPhBKOSXjHlc3yIHx2Qr1o_QjUqgIzd-vjS21cr6Z6p07MkPLcr55BJVfbraulafSKREaRnezrm2HwciVvZUxXOkepAngwmU8JlbDFAy93JFyIVsTtgPLCgDfmbk',
        },
      ],
    },
  ];
}
