# 인증 검증 상세 증거

AI가 격리된 workerd/D1의 임시 계정으로 생성한 실제 실행 요청·응답입니다. example.test는 시험 주소이며 공개 Cloudflare 배포 점검이나 사용자의 실제 사용 기록이 아닙니다.

실행 시각: 2026-10-26T08:08:53.114Z ~ 2026-10-26T08:08:54.221Z (UTC). 결과: 49 PASS, 임시 계정 정리 2/2.

비밀번호·쿠키·세션 원문·pepper는 가렸다. 계정명·자료 ID는 일관된 익명 표지로 바꾸고 저장 해시·내용 해시는 공개하지 않았습니다. 원본은 .private/auth-evidence-ai.json에 비공개로 보관합니다. 사용자가 공개 배포에서 실행한 원격 보고서와 구분한다.

## ① 가입·로그인·중복·동일 실패 문구

```json
[
  {
    "label": "A 가입",
    "actor": "anonymous",
    "method": "POST",
    "url": "https://example.test/api/auth/signup",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary"
      },
      "body": {
        "username": "[temporary_A]",
        "password": "[REDACTED]"
      }
    },
    "response": {
      "status": 201,
      "body": {
        "user": {
          "id": "[ID_7]",
          "username": "[temporary_A]"
        }
      }
    }
  },
  {
    "label": "A 로그인",
    "actor": "temporary_A",
    "method": "POST",
    "url": "https://example.test/api/auth/login",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary"
      },
      "body": {
        "username": "[temporary_A]",
        "password": "[REDACTED]"
      }
    },
    "response": {
      "status": 200,
      "body": {
        "user": {
          "id": "[ID_7]",
          "username": "[temporary_A]"
        },
        "expires_at": "2026-10-27T08:08:53.259Z"
      },
      "set_cookie": "[REDACTED]"
    }
  },
  {
    "label": "B 가입",
    "actor": "anonymous",
    "method": "POST",
    "url": "https://example.test/api/auth/signup",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary"
      },
      "body": {
        "username": "[temporary_B]",
        "password": "[REDACTED]"
      }
    },
    "response": {
      "status": 201,
      "body": {
        "user": {
          "id": "[ID_8]",
          "username": "[temporary_B]"
        }
      }
    }
  },
  {
    "label": "B 로그인",
    "actor": "temporary_B",
    "method": "POST",
    "url": "https://example.test/api/auth/login",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary"
      },
      "body": {
        "username": "[temporary_B]",
        "password": "[REDACTED]"
      }
    },
    "response": {
      "status": 200,
      "body": {
        "user": {
          "id": "[ID_8]",
          "username": "[temporary_B]"
        },
        "expires_at": "2026-10-27T08:08:53.448Z"
      },
      "set_cookie": "[REDACTED]"
    }
  },
  {
    "label": "동일 아이디 가입 차단",
    "actor": "anonymous",
    "method": "POST",
    "url": "https://example.test/api/auth/signup",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary"
      },
      "body": {
        "username": "[temporary_A]",
        "password": "[REDACTED]"
      }
    },
    "response": {
      "status": 409,
      "body": {
        "error": "이미 사용 중인 아이디입니다."
      }
    }
  },
  {
    "label": "틀린 비밀번호 로그인",
    "actor": "anonymous",
    "method": "POST",
    "url": "https://example.test/api/auth/login",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary"
      },
      "body": {
        "username": "[temporary_A]",
        "password": "[REDACTED]"
      }
    },
    "response": {
      "status": 401,
      "body": {
        "error": "아이디 또는 비밀번호를 확인해 주세요."
      }
    }
  },
  {
    "label": "없는 아이디 로그인",
    "actor": "anonymous",
    "method": "POST",
    "url": "https://example.test/api/auth/login",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary"
      },
      "body": {
        "username": "[unknown_account]",
        "password": "[REDACTED]"
      }
    },
    "response": {
      "status": 401,
      "body": {
        "error": "아이디 또는 비밀번호를 확인해 주세요."
      }
    }
  }
]
```

## ② 같은 임시 비밀번호의 서로 다른 저장 해시·salt

```json
{
  "checked_at": "2026-10-26T08:08:53.789Z",
  "same_test_password": true,
  "rows": [
    {
      "username": "[temporary_A]",
      "password_hash": "[REDACTED: private evidence only]"
    },
    {
      "username": "[temporary_B]",
      "password_hash": "[REDACTED: private evidence only]"
    }
  ],
  "pass": true,
  "sample_scope": "두 저장값의 비교는 격리 시험 계정에서 수행했습니다. 원본 저장 해시·salt는 .private/auth-evidence-ai.json에 보관하며 공개본에서는 제외합니다."
}
```

## ③ 같은 주소·방식의 로그인 전후·로그아웃 재전송

```json
[
  {
    "label": "익명 /api/state",
    "actor": "anonymous",
    "method": "GET",
    "url": "https://example.test/api/state",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary"
      }
    },
    "response": {
      "status": 401,
      "body": {
        "error": "로그인이 필요합니다."
      }
    }
  },
  {
    "label": "익명 자료 화면",
    "actor": "anonymous",
    "method": "GET",
    "url": "https://example.test/diary",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary"
      }
    },
    "response": {
      "status": 303,
      "body": {
        "non_json_response": true
      },
      "location": "https://example.test/?login=required"
    }
  },
  {
    "label": "로그아웃 전 같은 쿠키 조회",
    "actor": "temporary_A",
    "method": "GET",
    "url": "https://example.test/api/state",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary",
        "cookie": "[REDACTED]"
      }
    },
    "response": {
      "status": 200,
      "body": {
        "plans": [
          {
            "id": "[ID_4]",
            "title": "[자동 권한 점검] A",
            "start_date": "2026-10-26",
            "end_date": "2026-10-26",
            "priority": "보통",
            "success_criteria": "자동 접근통제 점검용 합성 자료",
            "expected_minutes": 0,
            "created_at": "2026-10-26T08:08:53.269Z",
            "updated_at": "2026-10-26T08:08:53.269Z"
          }
        ],
        "plan_revisions": [],
        "tasks": [
          {
            "id": "[ID_5]",
            "plan_id": "[ID_4]",
            "title": "[자동 권한 점검] A 삭제 시험",
            "due_at": null,
            "priority": "보통",
            "category": "자동 권한 점검",
            "expected_minutes": 0,
            "status": "todo",
            "blocked_reason": "",
            "deleted_at": "2026-10-26T08:08:53.317Z",
            "created_at": "2026-10-26T08:08:53.310Z",
            "updated_at": "2026-10-26T08:08:53.317Z"
          },
          {
            "id": "[ID_6]",
            "plan_id": "[ID_4]",
            "title": "[자동 권한 점검] A 수정 확인",
            "due_at": null,
            "priority": "보통",
            "category": "자동 권한 점검",
            "expected_minutes": 0,
            "status": "todo",
            "blocked_reason": "",
            "deleted_at": null,
            "created_at": "2026-10-26T08:08:53.280Z",
            "updated_at": "2026-10-26T08:08:53.304Z"
          }
        ],
        "execution_logs": [],
        "reflections": [],
        "task_completions": [],
        "reflection_links": [],
        "summary": {
          "plans": 1,
          "open_tasks": 1,
          "completed": 0,
          "overdue": 0,
          "blocked": 0,
          "expected_minutes": 0,
          "actual_minutes": 0,
          "difference_minutes": 0
        },
        "summaries": {
          "[ID_4]": {
            "plans": 1,
            "open_tasks": 1,
            "completed": 0,
            "overdue": 0,
            "blocked": 0,
            "expected_minutes": 0,
            "actual_minutes": 0,
            "difference_minutes": 0
          }
        },
        "evaluated_at": "2026-10-26T08:08:54.058Z"
      }
    }
  },
  {
    "label": "A 로그아웃",
    "actor": "temporary_A",
    "method": "POST",
    "url": "https://example.test/api/auth/logout",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary",
        "cookie": "[REDACTED]"
      }
    },
    "response": {
      "status": 200,
      "body": {
        "logged_out": true
      },
      "set_cookie": "[REDACTED]"
    }
  },
  {
    "label": "로그아웃 뒤 원래 쿠키 재전송",
    "actor": "temporary_A",
    "method": "GET",
    "url": "https://example.test/api/state",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary",
        "cookie": "[REDACTED]"
      }
    },
    "response": {
      "status": 401,
      "body": {
        "error": "로그인이 필요합니다."
      }
    }
  }
]
```

## ④ 여섯 양방향 접근 검사: 허용·거절 대응과 원문

```json
{
  "pairs": [
    {
      "case": "A → B 조회",
      "allowed_request_index": 13,
      "denied_request_index": 25,
      "method": "GET",
      "allowed_status": 200,
      "denied_status": 404,
      "target_note": "소유자와 타 계정이 같은 대상 URL에 요청함."
    },
    {
      "case": "A → B 수정",
      "allowed_request_index": 14,
      "denied_request_index": 26,
      "method": "PATCH",
      "allowed_status": 200,
      "denied_status": 404,
      "target_note": "소유자와 타 계정이 같은 대상 URL에 요청함."
    },
    {
      "case": "A → B 삭제",
      "allowed_request_index": 16,
      "denied_request_index": 27,
      "method": "DELETE",
      "allowed_status": 200,
      "denied_status": 404,
      "target_note": "허용은 소유자 자신의 별도 삭제 시험 항목, 거부는 피해 계정의 보존할 항목. 같은 URL의 삭제 성공이라고 주장하지 않음."
    },
    {
      "case": "B → A 조회",
      "allowed_request_index": 5,
      "denied_request_index": 32,
      "method": "GET",
      "allowed_status": 200,
      "denied_status": 404,
      "target_note": "소유자와 타 계정이 같은 대상 URL에 요청함."
    },
    {
      "case": "B → A 수정",
      "allowed_request_index": 6,
      "denied_request_index": 33,
      "method": "PATCH",
      "allowed_status": 200,
      "denied_status": 404,
      "target_note": "소유자와 타 계정이 같은 대상 URL에 요청함."
    },
    {
      "case": "B → A 삭제",
      "allowed_request_index": 8,
      "denied_request_index": 34,
      "method": "DELETE",
      "allowed_status": 200,
      "denied_status": 404,
      "target_note": "허용은 소유자 자신의 별도 삭제 시험 항목, 거부는 피해 계정의 보존할 항목. 같은 URL의 삭제 성공이라고 주장하지 않음."
    }
  ],
  "requests": [
    {
      "label": "A 본인 자료 조회",
      "actor": "temporary_A",
      "method": "GET",
      "url": "https://example.test/api/tasks/[ID_6]",
      "request": {
        "headers": {
          "content-type": "application/json",
          "x-requested-with": "aleph-diary",
          "cookie": "[REDACTED]"
        }
      },
      "response": {
        "status": 200,
        "body": {
          "id": "[ID_6]",
          "plan_id": "[ID_4]",
          "title": "[자동 권한 점검] A의 할 일",
          "due_at": null,
          "priority": "보통",
          "category": "자동 권한 점검",
          "expected_minutes": 0,
          "status": "todo",
          "blocked_reason": "",
          "deleted_at": null,
          "created_at": "2026-10-26T08:08:53.280Z",
          "updated_at": "2026-10-26T08:08:53.280Z"
        }
      }
    },
    {
      "label": "A 본인 자료 수정",
      "actor": "temporary_A",
      "method": "PATCH",
      "url": "https://example.test/api/tasks/[ID_6]",
      "request": {
        "headers": {
          "content-type": "application/json",
          "x-requested-with": "aleph-diary",
          "cookie": "[REDACTED]"
        },
        "body": {
          "title": "[자동 권한 점검] A 수정 확인"
        }
      },
      "response": {
        "status": 200,
        "body": {
          "id": "[ID_6]",
          "updated": true
        }
      }
    },
    {
      "label": "A 본인 자료 삭제",
      "actor": "temporary_A",
      "method": "DELETE",
      "url": "https://example.test/api/tasks/[ID_5]",
      "request": {
        "headers": {
          "content-type": "application/json",
          "x-requested-with": "aleph-diary",
          "cookie": "[REDACTED]"
        }
      },
      "response": {
        "status": 200,
        "body": {
          "id": "[ID_5]",
          "deleted": true
        }
      }
    },
    {
      "label": "B 본인 자료 조회",
      "actor": "temporary_B",
      "method": "GET",
      "url": "https://example.test/api/tasks/[ID_3]",
      "request": {
        "headers": {
          "content-type": "application/json",
          "x-requested-with": "aleph-diary",
          "cookie": "[REDACTED]"
        }
      },
      "response": {
        "status": 200,
        "body": {
          "id": "[ID_3]",
          "plan_id": "[ID_1]",
          "title": "[자동 권한 점검] B의 할 일",
          "due_at": null,
          "priority": "보통",
          "category": "자동 권한 점검",
          "expected_minutes": 0,
          "status": "todo",
          "blocked_reason": "",
          "deleted_at": null,
          "created_at": "2026-10-26T08:08:53.462Z",
          "updated_at": "2026-10-26T08:08:53.462Z"
        }
      }
    },
    {
      "label": "B 본인 자료 수정",
      "actor": "temporary_B",
      "method": "PATCH",
      "url": "https://example.test/api/tasks/[ID_3]",
      "request": {
        "headers": {
          "content-type": "application/json",
          "x-requested-with": "aleph-diary",
          "cookie": "[REDACTED]"
        },
        "body": {
          "title": "[자동 권한 점검] B 수정 확인"
        }
      },
      "response": {
        "status": 200,
        "body": {
          "id": "[ID_3]",
          "updated": true
        }
      }
    },
    {
      "label": "B 본인 자료 삭제",
      "actor": "temporary_B",
      "method": "DELETE",
      "url": "https://example.test/api/tasks/[ID_2]",
      "request": {
        "headers": {
          "content-type": "application/json",
          "x-requested-with": "aleph-diary",
          "cookie": "[REDACTED]"
        }
      },
      "response": {
        "status": 200,
        "body": {
          "id": "[ID_2]",
          "deleted": true
        }
      }
    },
    {
      "label": "temporary_A → temporary_B 조회",
      "actor": "temporary_A",
      "method": "GET",
      "url": "https://example.test/api/tasks/[ID_3]",
      "request": {
        "headers": {
          "content-type": "application/json",
          "x-requested-with": "aleph-diary",
          "cookie": "[REDACTED]"
        }
      },
      "response": {
        "status": 404,
        "body": {
          "error": "자료를 찾을 수 없습니다."
        }
      }
    },
    {
      "label": "temporary_A → temporary_B 수정",
      "actor": "temporary_A",
      "method": "PATCH",
      "url": "https://example.test/api/tasks/[ID_3]",
      "request": {
        "headers": {
          "content-type": "application/json",
          "x-requested-with": "aleph-diary",
          "cookie": "[REDACTED]"
        },
        "body": {
          "title": "차단돼야 하는 자동 점검 수정"
        }
      },
      "response": {
        "status": 404,
        "body": {
          "error": "할 일을 찾을 수 없습니다."
        }
      }
    },
    {
      "label": "temporary_A → temporary_B 삭제",
      "actor": "temporary_A",
      "method": "DELETE",
      "url": "https://example.test/api/tasks/[ID_3]",
      "request": {
        "headers": {
          "content-type": "application/json",
          "x-requested-with": "aleph-diary",
          "cookie": "[REDACTED]"
        }
      },
      "response": {
        "status": 404,
        "body": {
          "error": "할 일을 찾을 수 없습니다."
        }
      }
    },
    {
      "label": "temporary_B → temporary_A 조회",
      "actor": "temporary_B",
      "method": "GET",
      "url": "https://example.test/api/tasks/[ID_6]",
      "request": {
        "headers": {
          "content-type": "application/json",
          "x-requested-with": "aleph-diary",
          "cookie": "[REDACTED]"
        }
      },
      "response": {
        "status": 404,
        "body": {
          "error": "자료를 찾을 수 없습니다."
        }
      }
    },
    {
      "label": "temporary_B → temporary_A 수정",
      "actor": "temporary_B",
      "method": "PATCH",
      "url": "https://example.test/api/tasks/[ID_6]",
      "request": {
        "headers": {
          "content-type": "application/json",
          "x-requested-with": "aleph-diary",
          "cookie": "[REDACTED]"
        },
        "body": {
          "title": "차단돼야 하는 자동 점검 수정"
        }
      },
      "response": {
        "status": 404,
        "body": {
          "error": "할 일을 찾을 수 없습니다."
        }
      }
    },
    {
      "label": "temporary_B → temporary_A 삭제",
      "actor": "temporary_B",
      "method": "DELETE",
      "url": "https://example.test/api/tasks/[ID_6]",
      "request": {
        "headers": {
          "content-type": "application/json",
          "x-requested-with": "aleph-diary",
          "cookie": "[REDACTED]"
        }
      },
      "response": {
        "status": 404,
        "body": {
          "error": "할 일을 찾을 수 없습니다."
        }
      }
    }
  ]
}
```

## ⑤ 거절 전후 피해 자료의 건수·내용·해시와 소유자 위조

```json
[
  {
    "name": "temporary_B 행 수와 내용 불변",
    "pass": true,
    "before": {
      "counts": {
        "plans": 1,
        "plan_revisions": 0,
        "tasks": 2,
        "execution_logs": 0,
        "reflections": 0,
        "task_completions": 0,
        "reflection_links": 0
      },
      "content": {
        "plans": [
          {
            "id": "[ID_1]",
            "title": "[자동 권한 점검] B",
            "start_date": "2026-10-26",
            "end_date": "2026-10-26",
            "priority": "보통",
            "success_criteria": "자동 접근통제 점검용 합성 자료",
            "expected_minutes": 0,
            "created_at": "2026-10-26T08:08:53.456Z",
            "updated_at": "2026-10-26T08:08:53.456Z"
          }
        ],
        "plan_revisions": [],
        "tasks": [
          {
            "id": "[ID_2]",
            "plan_id": "[ID_1]",
            "title": "[자동 권한 점검] B 삭제 시험",
            "due_at": null,
            "priority": "보통",
            "category": "자동 권한 점검",
            "expected_minutes": 0,
            "status": "todo",
            "blocked_reason": "",
            "deleted_at": "2026-10-26T08:08:53.484Z",
            "created_at": "2026-10-26T08:08:53.479Z",
            "updated_at": "2026-10-26T08:08:53.484Z"
          },
          {
            "id": "[ID_3]",
            "plan_id": "[ID_1]",
            "title": "[자동 권한 점검] B 수정 확인",
            "due_at": null,
            "priority": "보통",
            "category": "자동 권한 점검",
            "expected_minutes": 0,
            "status": "todo",
            "blocked_reason": "",
            "deleted_at": null,
            "created_at": "2026-10-26T08:08:53.462Z",
            "updated_at": "2026-10-26T08:08:53.473Z"
          }
        ],
        "execution_logs": [],
        "reflections": [],
        "task_completions": [],
        "reflection_links": []
      },
      "content_sha256": "[REDACTED: private evidence only]"
    },
    "after": {
      "counts": {
        "plans": 1,
        "plan_revisions": 0,
        "tasks": 2,
        "execution_logs": 0,
        "reflections": 0,
        "task_completions": 0,
        "reflection_links": 0
      },
      "content": {
        "plans": [
          {
            "id": "[ID_1]",
            "title": "[자동 권한 점검] B",
            "start_date": "2026-10-26",
            "end_date": "2026-10-26",
            "priority": "보통",
            "success_criteria": "자동 접근통제 점검용 합성 자료",
            "expected_minutes": 0,
            "created_at": "2026-10-26T08:08:53.456Z",
            "updated_at": "2026-10-26T08:08:53.456Z"
          }
        ],
        "plan_revisions": [],
        "tasks": [
          {
            "id": "[ID_2]",
            "plan_id": "[ID_1]",
            "title": "[자동 권한 점검] B 삭제 시험",
            "due_at": null,
            "priority": "보통",
            "category": "자동 권한 점검",
            "expected_minutes": 0,
            "status": "todo",
            "blocked_reason": "",
            "deleted_at": "2026-10-26T08:08:53.484Z",
            "created_at": "2026-10-26T08:08:53.479Z",
            "updated_at": "2026-10-26T08:08:53.484Z"
          },
          {
            "id": "[ID_3]",
            "plan_id": "[ID_1]",
            "title": "[자동 권한 점검] B 수정 확인",
            "due_at": null,
            "priority": "보통",
            "category": "자동 권한 점검",
            "expected_minutes": 0,
            "status": "todo",
            "blocked_reason": "",
            "deleted_at": null,
            "created_at": "2026-10-26T08:08:53.462Z",
            "updated_at": "2026-10-26T08:08:53.473Z"
          }
        ],
        "execution_logs": [],
        "reflections": [],
        "task_completions": [],
        "reflection_links": []
      },
      "content_sha256": "[REDACTED: private evidence only]"
    }
  },
  {
    "name": "temporary_A 목록·URL·헤더 소유자 위조 차단",
    "pass": true
  },
  {
    "name": "temporary_A 본문의 다른 소유자 연결 거부",
    "pass": true
  },
  {
    "name": "temporary_A 행 수와 내용 불변",
    "pass": true,
    "before": {
      "counts": {
        "plans": 1,
        "plan_revisions": 0,
        "tasks": 2,
        "execution_logs": 0,
        "reflections": 0,
        "task_completions": 0,
        "reflection_links": 0
      },
      "content": {
        "plans": [
          {
            "id": "[ID_4]",
            "title": "[자동 권한 점검] A",
            "start_date": "2026-10-26",
            "end_date": "2026-10-26",
            "priority": "보통",
            "success_criteria": "자동 접근통제 점검용 합성 자료",
            "expected_minutes": 0,
            "created_at": "2026-10-26T08:08:53.269Z",
            "updated_at": "2026-10-26T08:08:53.269Z"
          }
        ],
        "plan_revisions": [],
        "tasks": [
          {
            "id": "[ID_5]",
            "plan_id": "[ID_4]",
            "title": "[자동 권한 점검] A 삭제 시험",
            "due_at": null,
            "priority": "보통",
            "category": "자동 권한 점검",
            "expected_minutes": 0,
            "status": "todo",
            "blocked_reason": "",
            "deleted_at": "2026-10-26T08:08:53.317Z",
            "created_at": "2026-10-26T08:08:53.310Z",
            "updated_at": "2026-10-26T08:08:53.317Z"
          },
          {
            "id": "[ID_6]",
            "plan_id": "[ID_4]",
            "title": "[자동 권한 점검] A 수정 확인",
            "due_at": null,
            "priority": "보통",
            "category": "자동 권한 점검",
            "expected_minutes": 0,
            "status": "todo",
            "blocked_reason": "",
            "deleted_at": null,
            "created_at": "2026-10-26T08:08:53.280Z",
            "updated_at": "2026-10-26T08:08:53.304Z"
          }
        ],
        "execution_logs": [],
        "reflections": [],
        "task_completions": [],
        "reflection_links": []
      },
      "content_sha256": "[REDACTED: private evidence only]"
    },
    "after": {
      "counts": {
        "plans": 1,
        "plan_revisions": 0,
        "tasks": 2,
        "execution_logs": 0,
        "reflections": 0,
        "task_completions": 0,
        "reflection_links": 0
      },
      "content": {
        "plans": [
          {
            "id": "[ID_4]",
            "title": "[자동 권한 점검] A",
            "start_date": "2026-10-26",
            "end_date": "2026-10-26",
            "priority": "보통",
            "success_criteria": "자동 접근통제 점검용 합성 자료",
            "expected_minutes": 0,
            "created_at": "2026-10-26T08:08:53.269Z",
            "updated_at": "2026-10-26T08:08:53.269Z"
          }
        ],
        "plan_revisions": [],
        "tasks": [
          {
            "id": "[ID_5]",
            "plan_id": "[ID_4]",
            "title": "[자동 권한 점검] A 삭제 시험",
            "due_at": null,
            "priority": "보통",
            "category": "자동 권한 점검",
            "expected_minutes": 0,
            "status": "todo",
            "blocked_reason": "",
            "deleted_at": "2026-10-26T08:08:53.317Z",
            "created_at": "2026-10-26T08:08:53.310Z",
            "updated_at": "2026-10-26T08:08:53.317Z"
          },
          {
            "id": "[ID_6]",
            "plan_id": "[ID_4]",
            "title": "[자동 권한 점검] A 수정 확인",
            "due_at": null,
            "priority": "보통",
            "category": "자동 권한 점검",
            "expected_minutes": 0,
            "status": "todo",
            "blocked_reason": "",
            "deleted_at": null,
            "created_at": "2026-10-26T08:08:53.280Z",
            "updated_at": "2026-10-26T08:08:53.304Z"
          }
        ],
        "execution_logs": [],
        "reflections": [],
        "task_completions": [],
        "reflection_links": []
      },
      "content_sha256": "[REDACTED: private evidence only]"
    }
  },
  {
    "name": "temporary_B 목록·URL·헤더 소유자 위조 차단",
    "pass": true
  },
  {
    "name": "temporary_B 본문의 다른 소유자 연결 거부",
    "pass": true
  }
]
```

## ⑥ 비밀번호 변경 뒤 이전 세션 거부·새 비밀번호 허용

```json
[
  {
    "label": "A 비밀번호 변경",
    "actor": "temporary_A",
    "method": "POST",
    "url": "https://example.test/api/auth/password",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary",
        "cookie": "[REDACTED]"
      },
      "body": {
        "current_password": "[REDACTED]",
        "new_password": "[REDACTED]"
      }
    },
    "response": {
      "status": 200,
      "body": {
        "changed": true,
        "login_required": true
      },
      "set_cookie": "[REDACTED]"
    }
  },
  {
    "label": "이전 세션 1 재전송",
    "actor": "temporary_A",
    "method": "GET",
    "url": "https://example.test/api/state",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary",
        "cookie": "[REDACTED]"
      }
    },
    "response": {
      "status": 401,
      "body": {
        "error": "로그인이 필요합니다."
      }
    }
  },
  {
    "label": "이전 세션 2 재전송",
    "actor": "temporary_A",
    "method": "GET",
    "url": "https://example.test/api/state",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary",
        "cookie": "[REDACTED]"
      }
    },
    "response": {
      "status": 401,
      "body": {
        "error": "로그인이 필요합니다."
      }
    }
  },
  {
    "label": "새 비밀번호 로그인",
    "actor": "anonymous",
    "method": "POST",
    "url": "https://example.test/api/auth/login",
    "request": {
      "headers": {
        "content-type": "application/json",
        "x-requested-with": "aleph-diary"
      },
      "body": {
        "username": "[temporary_A]",
        "password": "[REDACTED]"
      }
    },
    "response": {
      "status": 200,
      "body": {
        "user": {
          "id": "[ID_7]",
          "username": "[temporary_A]"
        },
        "expires_at": "2026-10-27T08:08:54.040Z"
      },
      "set_cookie": "[REDACTED]"
    }
  }
]
```

전체 요청·응답과 점검 목록: [검증 JSON](../public/verification.json).
