"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

// ── utils ───────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const addDays = (k, n) => { const [y, m, d] = k.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const DOW_MON = ["월", "화", "수", "목", "금", "토", "일"];
const labelDate = (k) => { const [y, m, d] = k.split("-").map(Number); const dt = new Date(y, m - 1, d); return { md: `${m}월 ${d}일`, dow: DOW[dt.getDay()], short: `${m}/${d}` }; };
const sleepMinutes = (bed, wake) => { if (!bed || !wake) return null; const [bh, bm] = bed.split(":").map(Number); const [wh, wm] = wake.split(":").map(Number); let m = wh * 60 + wm - (bh * 60 + bm); if (m <= 0) m += 1440; return m; };
const fmtSleep = (m) => m == null ? "—" : (m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${Math.floor(m / 60)}시간`);
const bedMin = (bed) => { if (!bed) return null; const [h, m] = bed.split(":").map(Number); let v = h * 60 + m; if (v < 12 * 60) v += 24 * 60; return v; };
const sleepMood = (m) => {
  if (m == null) return { emoji: "🌙", msg: "오늘 몇 시간 잤어?", sleepy: true };
  const h = m / 60;
  if (h < 5) return { emoji: "🥱", msg: "많이 피곤하겠다…", sleepy: true };
  if (h < 6.5) return { emoji: "😪", msg: "조금 더 자도 좋아", sleepy: true };
  if (h <= 9) return { emoji: "😊", msg: "푹 잤네요!", sleepy: false };
  return { emoji: "💤", msg: "든든하게 충전 완료!", sleepy: false };
};
const greeting = () => { const h = new Date().getHours(); if (h < 6) return "늦은 밤이야"; if (h < 12) return "좋은 아침이야"; if (h < 18) return "좋은 오후야"; if (h < 22) return "좋은 저녁이야"; return "좋은 밤이야"; };
const FIELDS = () => ({ bed: "", wake: "", exercise: false, exNote: "", snack: -1, snackNote: "", meals: { breakfast: "", lunch: "", dinner: "" }, mood: 0, gratitude: ["", "", ""], reflection: "", pg: null });
const blankEntry = () => ({ ...FIELDS(), cheers: 0 });
const dataForDb = (e) => { const { cheers, ...rest } = e; return rest; };
const entryFromRow = (row) => { const d = row.data || {}; return { ...FIELDS(), ...d, meals: { breakfast: "", lunch: "", dinner: "", ...(d.meals || {}) }, cheers: row.cheers ?? 0 }; };
// merge server data into local on poll: keep my own edits, take partner's from server, sync cheers on my slot
const mergeDays = (prev, server, me) => {
  const out = {}; const dates = new Set([...Object.keys(prev), ...Object.keys(server)]);
  dates.forEach((dk) => {
    const pd = prev[dk] || {}, sd = server[dk] || {}; const day = {};
    ["a", "b"].forEach((slot) => {
      const ps = pd[slot], ss = sd[slot];
      if (slot === me) { if (ps) day[slot] = { ...ps, cheers: ss ? ss.cheers : ps.cheers }; else if (ss) day[slot] = ss; }
      else { if (ss) day[slot] = ss; else if (ps) day[slot] = ps; }
    });
    if (Object.keys(day).length) out[dk] = day;
  });
  return out;
};
const SNACKS = ["안 먹음", "조금", "보통", "많이"];
const MOODS = ["😞", "😕", "😐", "🙂", "😄"];
const DEFAULT_REWARDS = [
  { emoji: "☕", title: "커피 사주기", cost: 40 },
  { emoji: "🍰", title: "디저트 사주기", cost: 50 },
  { emoji: "🧹", title: "설거지 면제권", cost: 50 },
  { emoji: "💆", title: "어깨 마사지 15분", cost: 60 },
  { emoji: "🍽️", title: "저녁 메뉴 결정권", cost: 120 },
  { emoji: "🎬", title: "영화 데이트 준비하기", cost: 150 },
  { emoji: "🍳", title: "원하는 요리 해주기", cost: 180 },
  { emoji: "🎮", title: "주말 반나절 자유시간", cost: 200 },
  { emoji: "🎁", title: "갖고 싶은 선물 하나", cost: 500 },
  { emoji: "🌟", title: "뭐든 소원 하나 들어주기", cost: 550 },
  { emoji: "✈️", title: "특별한 하루 데이트 코스", cost: 700 },
];
const COUPLE_Q = [
  "오늘 상대의 어떤 점이 제일 고마웠어?", "최근 상대가 나를 웃게 한 순간은?", "요즘 상대에게 가장 해주고 싶은 건?", "상대의 어떤 표정을 제일 좋아해?", "우리 둘만의 추억 중 가장 아끼는 건?",
  "다음 데이트로 가고 싶은 곳은?", "상대에게 배우고 싶은 점은?", "오늘 하루 중 상대와 나누고 싶은 순간은?", "상대의 어떤 말이 힘이 됐어?", "우리가 처음 만난 날 기억나는 장면은?",
  "요즘 상대가 제일 열심히 하는 것 같은 건?", "상대에게 미안했던 작은 일이 있다면?", "함께 도전해보고 싶은 새로운 것은?", "상대의 어떤 습관이 귀여워?", "오늘 상대를 한 단어로 표현하면?",
  "같이 먹고 싶은 음식은?", "상대와 함께라서 달라진 내 모습은?", "10년 뒤 우리는 어떤 모습일까?", "상대에게 지금 바로 문자 보낸다면 뭐라고?", "상대의 어떤 점을 닮고 싶어?",
  "요즘 상대가 힘들어 보이는 부분은?", "우리 사이 별명을 새로 짓는다면?", "상대와 가장 편안한 순간은 언제야?", "오늘 상대에게 고백하고 싶은 사소한 진심은?", "함께 보고 싶은 영화나 드라마는?",
  "상대가 만든 요리 중 최고는?", "우리가 함께 이겨낸 일이 있다면?", "상대의 웃음소리를 들으면 드는 생각은?", "주말에 같이 하고 싶은 게으른 일은?", "상대에게 가장 고마운 최근의 배려는?",
  "상대와 여행 간다면 어디로?", "상대의 어떤 노력을 알아주고 싶어?", "지금 상대가 옆에 있다면 하고 싶은 말은?", "우리만 아는 웃긴 순간은?", "상대에게서 가장 안정감을 느낄 때는?",
  "함께 만들어가고 싶은 우리의 규칙은?", "상대의 어떤 취향을 응원해?", "오늘 상대 덕분에 나아진 기분이 있다면?", "서로에게 첫인상은 어땠을까?", "상대와 오래 하고 싶은 약속 하나는?",
];
const COUPLE_Q_EXTRA = [
  "서로에게 처음 반한 순간은 언제였어?", "상대와 함께라서 달라진 나의 모습은?", "우리 커플의 최대 강점은 뭐라고 생각해?", "상대가 자는 모습을 보면 무슨 생각이 들어?", "10년 뒤 우리는 어떤 모습일까?",
  "상대에게 아직 말 못 한 사소한 비밀은?", "우리 둘이 같이 살면 제일 재밌을 것 같은 건?", "상대의 손을 잡을 때 기분을 한 단어로?", "서로 바꿔서 하루를 산다면 뭐부터 할래?", "상대가 요리해줬으면 하는 메뉴는?",
  "우리만 아는 유행어나 별명 중 최애는?", "상대와 여행 간다면 국내? 해외? 어디?", "상대의 카톡 답장 스타일 평가하자면?", "둘 중 누가 더 어른스러워? 왜?", "상대에게 하루 종일 심부름 시킬 수 있다면 뭐 시킬래?",
  "상대의 옷장에서 훔치고 싶은 옷은?", "우리 커플 주제곡을 정한다면?", "상대가 화났을 때 푸는 최고의 방법은?", "둘이 같이 키우고 싶은 동물은?", "상대의 어릴 적 사진을 보면 무슨 생각이 들어?",
  "서로의 부모님께 제일 감사한 점은?", "상대와 함께 본 것 중 최고의 영화/드라마는?", "둘이 만약 복권 당첨되면 제일 먼저 할 일은?", "상대가 아플 때 해주고 싶은 것은?", "우리의 다음 기념일에 하고 싶은 것은?",
  "상대의 웃음소리를 묘사한다면?", "둘 중 누가 더 길치야? 에피소드 있어?", "상대에게 요즘 제일 궁금한 것은?", "함께 늙어가면서 꼭 하고 싶은 것 하나는?", "상대가 세상에서 제일 잘하는 것 같은 건?",
  "오늘 하루 상대 덕분에 참을 수 있었던 것은?", "상대와의 첫 여행에서 기억나는 장면은?", "둘이 함께 만들고 싶은 새로운 습관은?", "상대의 목소리 중 제일 좋아하는 톤은?", "만약 내일 지구가 멸망한다면 상대와 뭐 할래?",
  "상대에게 선물받고 싶은 것 (비쌀 필요 없음)?", "우리 커플을 영화 제목으로 표현하면?", "상대의 잠버릇 중 귀여운 것은?", "서로에게 점수를 준다면 오늘 몇 점? 이유는?", "지금 상대에게 가장 하고 싶은 말 한마디는?",
];
const COUPLE_Q_EXTRA2 = [
  // 추억·과거
  "우리가 사귀기 전, 서로를 뭐라고 저장해뒀었어?", "고백하던 날 제일 떨렸던 순간은?", "상대의 첫인상과 지금, 제일 달라진 점은?", "우리 커플 역사상 최고의 웃긴 사건은?", "처음으로 손잡은 날 기억나?",
  "상대와 처음 먹은 음식이 뭐였는지 기억나?", "제일 오래 통화한 날, 무슨 얘기했었어?", "상대의 프로필 사진 중 역대 최애는?", "우리가 함께 찍은 사진 중 제일 아끼는 한 장은?", "사귀고 나서 제일 놀랐던 상대의 반전 매력은?",
  "상대가 나를 처음 웃긴 순간 기억나?", "우리의 첫 싸움, 지금 생각하면 어때?", "상대와의 카톡 중 캡처해둔 게 있다면 뭐야?", "예전으로 딱 하루 돌아간다면 우리 언제로 갈래?", "상대를 친구들에게 처음 소개했을 때 기분은?",
  // 일상·오늘
  "오늘 상대가 없었다면 못 버텼을 순간이 있어?", "오늘 하루를 색깔로 표현하면?", "지금 이 순간 상대가 옆에 있다면 뭐 하고 싶어?", "오늘 상대에게 자랑하고 싶은 사소한 일은?", "오늘 들은 말 중 제일 기억에 남는 건?",
  "요즘 아침에 눈 뜨면 제일 먼저 드는 생각은?", "오늘 상대 생각난 순간이 언제였어?", "지금 냉장고에서 꺼내 먹고 싶은 것은?", "오늘의 나에게 한마디 해준다면?", "요즘 제일 자주 듣는 노래는?",
  "오늘 걸으면서 무슨 생각했어?", "요즘 잠들기 전에 하는 생각은?", "오늘 제일 맛있게 먹은 것은?", "지금 몸 상태를 날씨로 표현하면?", "오늘 스스로 칭찬하고 싶은 것 하나는?",
  // 취향·서로 알기
  "상대가 좋아하는 나의 옷 스타일은 뭘 것 같아?", "내가 모르는 상대의 취미가 있다면?", "상대의 최애 음식 TOP3를 맞혀봐!", "상대가 스트레스 받으면 하는 행동은?", "상대의 폰 배경화면이 뭔지 알아?",
  "상대가 제일 무서워하는 것은?", "상대의 어릴 적 장래희망이 뭐였을 것 같아?", "상대가 노래방에서 부르는 18번은?", "상대의 소울푸드는 뭐라고 생각해?", "상대가 요즘 제일 갖고 싶어하는 것은?",
  "상대의 MBTI에서 제일 공감되는 부분은?", "상대가 싫어하는 음식 다 말해봐!", "상대의 습관 중 나만 아는 것은?", "상대가 좋아하는 계절과 이유를 맞혀봐!", "상대의 이상형에 내가 몇 % 부합하는 것 같아?",
  // 음식·먹거리
  "지금 당장 같이 먹고 싶은 야식은?", "우리 동네 최고 맛집을 하나만 꼽는다면?", "상대와 같이 만들어보고 싶은 요리는?", "치킨 vs 피자, 최후의 선택은?", "상대에게 추천하고 싶은 인생 메뉴는?",
  "둘이 무한리필 간다면 어디로?", "여행 가서 먹은 것 중 최고였던 것은?", "비 오는 날 같이 먹고 싶은 것은?", "상대가 해준 것 중 제일 맛있었던 것은?", "디저트 하나만 평생 먹는다면?",
  // 여행·모험
  "당장 내일 떠날 수 있다면 어디 갈래?", "상대와 캠핑 간다면 뭐가 제일 기대돼?", "우리 신혼여행(?)은 어디로 가고 싶어?", "기차여행 vs 드라이브, 뭐가 좋아?", "상대와 걷고 싶은 길이 있다면?",
  "여행에서 상대가 맡아줬으면 하는 역할은?", "둘이 한 달 살기 한다면 어느 도시?", "여행 중 최악의 상황에서 상대가 어떻게 해줬으면 해?", "버킷리스트 여행지 하나 공유하자!", "상대와 바다 vs 산, 어디 가고 싶어?",
  // 만약에·상상
  "복권 10억 당첨되면 상대에게 얼마 줄 거야?", "하루 동안 투명인간이 된다면 뭐 할래?", "상대와 무인도에 갇히면 뭐부터 할래?", "타임머신으로 미래를 볼 수 있다면 볼래, 말래?", "상대가 연예인이 된다면 어떤 분야일 것 같아?",
  "동물로 다시 태어난다면 뭐가 되고 싶어?", "하루만 서로 성별이 바뀐다면 뭐 해보고 싶어?", "초능력 하나를 고른다면?", "우리 둘이 시트콤 주인공이라면 제목은?", "상대의 전생은 뭐였을 것 같아?",
  "로또 대신 무제한 시간이 생긴다면 뭐 할래?", "둘 중 한 명만 우주여행 갈 수 있다면 누가 가?", "상대와 게임 세계에 들어간다면 어떤 게임?", "하루 동안 상대의 폰을 마음껏 볼 수 있다면 볼래?", "우리가 드라마 주인공이라면 어떤 장르야?",
  // 미래·꿈
  "5년 뒤 우리는 뭘 하고 있을까?", "상대와 함께 이루고 싶은 목표 하나는?", "우리 집을 갖게 되면 제일 먼저 사고 싶은 가구는?", "노후에 상대와 뭐 하면서 살고 싶어?", "상대의 꿈을 응원하는 방법, 뭐가 좋을까?",
  "내년 이맘때 우리는 어디 있을까?", "상대와 함께 배우고 싶은 것은?", "우리만의 전통을 하나 만든다면?", "상대가 미래에 꼭 이뤘으면 하는 것은?", "10년 뒤 오늘, 우리 뭐 하고 있을까?",
  // 장난·티키타카
  "상대의 흑역사 하나 폭로해봐 ㅋㅋ", "둘 중 누가 더 잘생기고 예뻐? 솔직히!", "상대 폰에서 제일 궁금한 앱은?", "상대가 3일 동안 씻지 않았다면 어떻게 할래?", "둘 중 누가 더 짠돌이야?",
  "상대의 애교 점수는 몇 점?", "상대 몰래 하는 행동 하나 고백해!", "둘이 싸우면 보통 누가 먼저 사과해?", "상대의 콧구멍 크기에 대해 어떻게 생각해 ㅋㅋ", "상대가 방귀 뀌면 어떻게 반응할 거야?",
  "둘 중 누가 더 먹보야?", "상대의 이상한 습관 하나만 말해봐!", "상대에게 벌칙을 준다면 뭘 시킬래?", "둘 중 누가 더 늦잠꾸러기야?", "상대의 노래 실력 솔직 평가 부탁!",
  "상대가 갑자기 삭발하고 온다면?", "둘 중 누가 더 겁쟁이야?", "상대의 패션 중 이해 안 되는 것 하나는?", "상대를 동물로 비유하면? 이유도!", "둘 중 누가 더 고집 세?",
  // 깊은 이야기
  "요즘 제일 큰 고민이 뭐야?", "상대에게 위로받고 싶었던 순간이 있었어?", "나도 모르게 상대에게 서운했던 적 있어?", "요즘 나를 지치게 하는 것과 힘나게 하는 것은?", "상대에게 처음으로 고맙다고 말하고 싶은 것은?",
  "인생에서 제일 잘한 선택은 뭐라고 생각해?", "상대와 있을 때 나는 어떤 사람이 되는 것 같아?", "요즘 스스로에게 아쉬운 점이 있다면?", "상대가 힘들어 보일 때 어떻게 다가가면 좋을까?", "우리 관계에서 제일 지키고 싶은 것은?",
  "어른이 됐다고 느낀 순간은 언제야?", "요즘 감정 날씨는 어때? 맑음? 흐림?", "상대에게 기대고 싶은 순간은 언제야?", "최근에 혼자 삭힌 감정이 있다면?", "상대의 존재가 제일 크게 느껴진 순간은?",
  // 계절·날씨
  "이번 계절에 상대와 꼭 하고 싶은 것은?", "첫눈 오는 날 뭐 하고 싶어?", "무더운 여름, 최고의 피서법은?", "봄 하면 떠오르는 우리의 추억은?", "가을에 같이 걷고 싶은 곳은?",
  "장마철 집에서 같이 하고 싶은 것은?", "벚꽃 시즌에 가고 싶은 곳은?", "겨울 데이트 최고의 코스는?", "더위/추위 중 뭐가 더 싫어?", "계절이 바뀔 때 드는 기분은?",
  // 성장·응원
  "최근에 스스로 성장했다고 느낀 순간은?", "상대에게 배워서 나도 하게 된 것이 있어?", "요즘 도전하고 있는 것, 잘 되고 있어?", "상대가 나를 성장시킨 부분이 있다면?", "올해 남은 기간 꼭 이루고 싶은 것 하나는?",
  "실패해도 괜찮다고 느꼈던 경험 있어?", "상대의 어떤 점을 닮고 싶어?", "지금 나에게 필요한 응원 한마디는?", "요즘 새로 시작한 것 있어?", "1년 전의 나와 지금의 나, 뭐가 달라?",
  // 감사·마음
  "오늘 상대에게 새삼 고마웠던 것은?", "당연하게 여겼지만 사실 감사한 것 하나는?", "상대의 가족에게 감사한 점이 있다면?", "요즘 나를 웃게 하는 존재들은?", "지난주 중 제일 감사했던 순간은?",
  "상대가 해주는 것 중 제일 좋은 스킨십은?", "말 안 해도 통한다고 느낀 순간 있어?", "상대의 다정함을 느낀 최근 순간은?", "내가 사랑받고 있구나 느낄 때는 언제야?", "상대에게 미안하지만 고마웠던 일이 있다면?",
  // 문화·재미
  "요즘 빠져 있는 콘텐츠(드라마/유튜브/웹툰)는?", "상대에게 강추하고 싶은 영화 하나는?", "같이 정주행하고 싶은 시리즈는?", "요즘 유행 중에 이해 안 되는 것 있어?", "상대와 같이 가고 싶은 콘서트나 공연은?",
  "만화 주인공 중 상대와 닮은 캐릭터는?", "요즘 즐겨 보는 유튜버는?", "상대와 같이 하고 싶은 게임은?", "최근에 본 것 중 눈물 난 콘텐츠는?", "우리 둘이 유튜브 채널을 만든다면 컨셉은?",
  // 어린 시절
  "어릴 때 별명이 뭐였어?", "초등학생 때 제일 좋아한 급식 메뉴는?", "어릴 적 소풍 하면 떠오르는 기억은?", "학창시절 제일 좋아했던 과목과 이유는?", "어릴 때 모으던 것이 있었어?",
  "첫사랑은 몇 살 때였어? ㅋㅋ", "학교 앞 분식집에서 뭐 자주 먹었어?", "어릴 적 갖고 싶었던 장난감은?", "방학 숙제는 미리 하는 편이었어, 몰아서?", "어릴 때 꿈꾸던 어른의 모습과 지금, 비슷해?",
  // 몸·건강
  "요즘 컨디션 몇 점? 이유는?", "최근 몸이 보내는 신호 중 신경 쓰이는 것은?", "상대의 건강을 위해 해주고 싶은 것은?", "요즘 나의 수면 만족도는 몇 점?", "같이 하면 재밌을 것 같은 운동은?",
  "스트레스 해소법 하나 공유하자!", "요즘 몸에 좋은 것 챙겨 먹는 거 있어?", "하루 중 제일 피곤한 시간대는 언제야?", "상대의 건강 습관 중 본받고 싶은 것은?", "요즘 나에게 필요한 휴식은 어떤 종류야?",
  // 우리 관계
  "우리 커플만의 규칙을 만든다면?", "상대에게 더 자주 듣고 싶은 말은?", "우리 사이에서 제일 편한 순간은 언제야?", "상대와 나, 서로 반대라서 좋은 점은?", "우리가 더 자주 했으면 하는 것은?",
  "상대에게 부탁하고 싶은 사소한 것 하나는?", "우리 관계를 한 문장으로 표현하면?", "둘만의 시간 중 제일 소중한 루틴은?", "상대와 대화할 때 제일 즐거운 주제는?", "우리의 케미를 퍼센트로 표현하면?",
  "서로에게 별명을 새로 지어준다면?", "상대와 같이 있을 때 시간이 제일 빨리 가는 순간은?", "우리 커플의 올해의 장면을 하나 뽑는다면?", "상대에게 편지를 쓴다면 첫 문장은?", "지금까지 함께한 시간 중 제일 감사한 것은?",
  // 랜덤 재미
  "지금 떠오르는 단어 3개로 상대를 표현하면?", "오늘 밤 꿈에서 만나면 뭐 하고 싶어?", "상대의 오늘 패션 점수는?", "지금 시간을 멈출 수 있다면 뭐 할래?", "상대와 텔레파시가 통한다면 제일 먼저 보낼 생각은?",
  "우리 둘의 공통점 3개를 찾아봐!", "상대 이름으로 삼행시 지어봐!", "오늘의 상대를 이모지 3개로 표현하면?", "상대가 슈퍼히어로라면 능력은 뭘까?", "내일 아침 상대에게 해주고 싶은 첫마디는?",
  // 취향 배틀
  "민초 vs 반민초, 상대는 어느 쪽?", "부먹 vs 찍먹, 논쟁 시작!", "아침형 vs 저녁형, 우리 잘 맞아?", "짜장 vs 짬뽕, 오늘의 선택은?", "바닷가 카페 vs 숲속 카페?",
  "영화관 vs 집에서 넷플릭스?", "물냉 vs 비냉?", "계획여행 vs 즉흥여행?", "전화 vs 문자, 뭐가 편해?", "겨울바다 vs 여름밤 산책?",
  // 소소한 행복
  "오늘 발견한 작은 행복 하나는?", "요즘 나만의 소확행은?", "출퇴근길에 기분 좋아지는 순간 있어?", "최근에 산 것 중 제일 만족스러운 것은?", "요즘 나를 설레게 하는 것은?",
  "샤워하면서 무슨 생각해?", "요즘 즐겨 마시는 음료는?", "기분 전환이 필요할 때 가는 곳은?", "요즘 나의 힐링 타임은 언제야?", "사소하지만 포기 못 하는 사치 하나는?",
  // 서로에게 궁금
  "내가 없을 때 뭐 하고 놀아?", "친구들 사이에서 나는 어떤 사람으로 소개돼?", "상대의 지갑/가방 속 제일 궁금한 물건은?", "나에 대해 부모님께 뭐라고 말했어?", "혼자만의 시간에 제일 하고 싶은 것은?",
  "상대의 검색 기록 중 최근 제일 웃긴 것은?", "나 몰래 봤던 나의 SNS 게시물 있어?", "상대의 알람은 몇 개나 돼? ㅋㅋ", "핸드폰 사진첩 맨 위에 뭐가 있어?", "요즘 배달앱에서 제일 자주 시키는 것은?",
  // 결정과 가치
  "돈과 시간 중 지금 더 필요한 것은?", "일과 휴식의 균형, 잘 지키고 있어?", "최근에 제일 잘 쓴 돈은?", "물건 살 때 고민 오래 하는 편이야?", "인생에서 타협 못 하는 한 가지는?",
  "행복의 조건 세 가지를 꼽는다면?", "요즘 제일 아끼는 물건은?", "시간이 남으면 뭐부터 해?", "저축 vs 현재를 즐기기, 어느 쪽?", "10년 뒤에도 변하지 않았으면 하는 것은?",
  // 표현과 애정
  "사랑한다는 말 대신 쓸 수 있는 우리만의 말은?", "손편지 vs 깜짝선물, 뭐가 더 감동?", "상대의 어떤 칭찬이 제일 기분 좋아?", "안아줄 때 vs 손잡을 때, 언제 제일 안정돼?", "애정표현 중 더 늘려줬으면 하는 것은?",
  "상대가 아침에 보내는 첫 카톡, 뭐면 좋겠어?", "기념일에 받고 싶은 최고의 선물은 물건? 경험?", "상대의 사랑을 확인하고 싶을 때 어떻게 해?", "우리만의 애칭, 만족해? 바꾸고 싶어?", "말없이 같이 있어도 편한 순간은 언제야?",
  // 미니 게임
  "상대가 좋아하는 숫자를 맞혀봐!", "내가 지금 생각하는 음식을 맞혀봐!", "상대의 신발 사이즈 알고 있어?", "나의 최근 통화 상대가 누구게?", "상대의 생년월일시까지 정확히 알아?",
  "내 폰 배터리 몇 %게?", "상대가 오늘 몇 걸음 걸었을까?", "지금 내 기분을 맞혀봐!", "상대의 통장 비밀번호... 는 농담이고 최애 색깔은?", "오늘 내가 마신 커피/음료 수를 맞혀봐!",
  // 하루 마무리
  "오늘 하루로 4행시 지어봐 (오늘하루)!", "오늘 밤 자기 전에 꼭 하고 싶은 것은?", "내일 눈 뜨면 제일 먼저 하고 싶은 것은?", "오늘의 나에게 점수를 준다면?", "오늘 상대에게 굿나잇 인사를 특별하게 해본다면?",
  "이번 주말 계획 있어? 같이 뭐 할까?", "오늘 못다 한 말이 있다면 지금 해봐!", "자기 전 마지막으로 보는 것은 뭐야?", "오늘 밤 꿀잠을 위한 나만의 의식은?", "내일의 우리에게 응원 한마디!",
  "우리의 100일 뒤 오늘은 어떤 하루일까?", "상대와 함께 심고 싶은 나무나 꽃이 있다면?", "우리 커플의 슬로건을 만든다면?", "상대의 하루 중 제일 궁금한 시간대는?", "1년 뒤 이 질문에 뭐라고 답하고 싶어? — 우리는 어떤 커플이야?",
];
const qForDate = (d) => {
  const ALL = [...COUPLE_Q, ...COUPLE_Q_EXTRA, ...COUPLE_Q_EXTRA2];
  return d >= "2026-08-03" ? ALL[dayOfYear(d) % ALL.length] : COUPLE_Q[dayOfYear(d) % COUPLE_Q.length];
};
const CHEER_PRESETS = ["오늘도 고생했어 🤍", "잘 자, 내 꿈 꿔 🌙", "네가 최고야 ✨", "보고 싶다 🥰", "오늘 하루도 예뻤어", "푹 쉬어, 사랑해 💗", "늘 응원해 📣", "고마워, 늘 🌸"];
const CHEER_PRESETS_BY_SLOT = { a: CHEER_PRESETS, b: ["ALL IS WELL"] };
const TIER_NAMES = { 1: "베이직", 2: "레어", 3: "에픽", 4: "레전더리" };
const CATS = [["head", "👒 머리"], ["face", "🙂 얼굴"], ["neck", "🧣 목"], ["prop", "🎈 소품"], ["aura", "✨ 오라"], ["frame", "🖼️ 프레임"], ["bg", "🌌 배경"]];
const ITEMS = [
  { id: "h_bow_p", cat: "head", tier: 1, price: 10, name: "분홍 리본", icon: "🎀", svg: "bow_pink" },
  { id: "h_bow_b", cat: "head", tier: 1, price: 10, name: "하늘 리본", icon: "🩵", svg: "bow_blue" },
  { id: "h_cap", cat: "head", tier: 1, price: 12, name: "야구캡", icon: "🧢", e: "🧢" },
  { id: "h_straw", cat: "head", tier: 1, price: 15, name: "밀짚모자", icon: "👒", e: "👒" },
  { id: "h_cherry", cat: "head", tier: 2, price: 45, name: "체리 핀", icon: "🍒", e: "🍒", st: { left: "20%", top: "-6%", transform: "rotate(-18deg)", fontSize: 18 } },
  { id: "h_beret", cat: "head", tier: 2, price: 60, name: "프렌치 베레모", icon: "🧶", svg: "beret" },
  { id: "h_bear", cat: "head", tier: 2, price: 70, name: "곰돌이 귀", icon: "🐻", svg: "bear" },
  { id: "h_fcrown", cat: "head", tier: 3, price: 150, name: "벚꽃 화관", icon: "🌸", svg: "fcrown" },
  { id: "h_tiara", cat: "head", tier: 4, price: 420, name: "보석 티아라", icon: "👑", svg: "tiara" },
  { id: "h_halo", cat: "head", tier: 4, price: 450, name: "천사의 링", icon: "😇", svg: "halo" },
  { id: "f_blush", cat: "face", tier: 1, price: 10, name: "복숭아 블러시", icon: "🍑", svg: "blush" },
  { id: "f_glass", cat: "face", tier: 1, price: 15, name: "동글 안경", icon: "👓", svg: "glasses" },
  { id: "f_hblush", cat: "face", tier: 2, price: 50, name: "하트 볼터치", icon: "💗", pair: true, e: "💗" },
  { id: "f_star", cat: "face", tier: 2, price: 45, name: "별 스티커", icon: "⭐", e: "⭐", st: { top: "54%", right: "18%", fontSize: 12 } },
  { id: "f_sparkle", cat: "face", tier: 3, price: 130, name: "반짝 페이스", icon: "✨", pair: true, e: "✨", cls: "td-twk" },
  { id: "f_holo", cat: "face", tier: 4, price: 300, name: "홀로 하트뺨", icon: "💖", pair: true, e: "💖", cls: "td-beat" },
  { id: "n_tie", cat: "neck", tier: 1, price: 12, name: "리본 타이", icon: "🎀", svg: "tie" },
  { id: "n_scarf", cat: "neck", tier: 2, price: 55, name: "체크 목도리", icon: "🧣", svg: "scarf" },
  { id: "n_daisy", cat: "neck", tier: 2, price: 60, name: "데이지 목걸이", icon: "🌼", e: "🌼", st: { bottom: "0%", left: "50%", transform: "translateX(-50%)", fontSize: 15 } },
  { id: "n_pearl", cat: "neck", tier: 3, price: 150, name: "진주 목걸이", icon: "📿", svg: "pearl" },
  { id: "n_aurora", cat: "neck", tier: 4, price: 350, name: "오로라 스카프", icon: "🌈", svg: "aurorascarf" },
  { id: "p_candy", cat: "prop", tier: 1, price: 10, name: "막대사탕", icon: "🍭", e: "🍭" },
  { id: "p_boba", cat: "prop", tier: 1, price: 15, name: "버블티", icon: "🧋", e: "🧋" },
  { id: "p_tulip", cat: "prop", tier: 2, price: 45, name: "튤립 한 송이", icon: "🌷", e: "🌷" },
  { id: "p_balloon", cat: "prop", tier: 2, price: 50, name: "빨간 풍선", icon: "🎈", e: "🎈" },
  { id: "p_bear", cat: "prop", tier: 2, price: 70, name: "미니 곰인형", icon: "🧸", e: "🧸" },
  { id: "p_bouquet", cat: "prop", tier: 3, price: 140, name: "파스텔 꽃다발", icon: "💐", e: "💐" },
  { id: "p_wand", cat: "prop", tier: 3, price: 160, name: "요술봉", icon: "🪄", e: "🪄", cls: "td-twk" },
  { id: "p_lantern", cat: "prop", tier: 4, price: 320, name: "반딧불 랜턴", icon: "🏮", e: "🏮", cls: "td-glow" },
  { id: "a_dot", cat: "aura", tier: 1, price: 10, name: "은은한 반짝", icon: "✧", ps: ["✧", "✧", "✧"] },
  { id: "a_heart", cat: "aura", tier: 2, price: 45, name: "하트", icon: "💗", ps: ["💗", "💕", "💖"] },
  { id: "a_star", cat: "aura", tier: 2, price: 45, name: "별빛", icon: "⭐", ps: ["⭐", "🌟", "✨"] },
  { id: "a_petal", cat: "aura", tier: 2, price: 60, name: "벚꽃잎", icon: "🌸", ps: ["🌸", "💮", "🌸"] },
  { id: "a_bubble", cat: "aura", tier: 2, price: 50, name: "비눗방울", icon: "🫧", ps: ["🫧", "🫧", "💧"] },
  { id: "a_btf", cat: "aura", tier: 3, price: 150, name: "나비 정원", icon: "🦋", ps: ["🦋", "🦋", "✨"] },
  { id: "a_snow", cat: "aura", tier: 3, price: 140, name: "첫눈", icon: "❄️", ps: ["❄️", "🤍", "❄️"] },
  { id: "a_meteor", cat: "aura", tier: 4, price: 420, name: "유성우", icon: "🌠", ps: ["🌠", "💫", "⭐"], spd: 2 },
  { id: "fr_pink", cat: "frame", tier: 1, price: 10, name: "파스텔 핑크 링", icon: "🩷" },
  { id: "fr_mint", cat: "frame", tier: 1, price: 10, name: "파스텔 민트 링", icon: "💚" },
  { id: "fr_lav", cat: "frame", tier: 1, price: 10, name: "라벤더 링", icon: "💜" },
  { id: "fr_gold", cat: "frame", tier: 2, price: 70, name: "골드 링", icon: "🥇" },
  { id: "fr_rose", cat: "frame", tier: 2, price: 80, name: "로즈골드 링", icon: "🌹" },
  { id: "fr_lace", cat: "frame", tier: 3, price: 150, name: "레이스", icon: "🤍" },
  { id: "fr_neon", cat: "frame", tier: 3, price: 130, name: "네온", icon: "💠" },
  { id: "fr_holo", cat: "frame", tier: 4, price: 380, name: "홀로그램", icon: "🌈" },
  { id: "b_pastel", cat: "bg", tier: 1, price: 15, name: "파스텔 하늘", icon: "🎨" },
  { id: "b_cloud", cat: "bg", tier: 2, price: 60, name: "구름 위 산책", icon: "☁️", sp: [{ e: "☁️", st: { top: "14%", left: "8%", fontSize: 13 } }, { e: "☁️", st: { top: "34%", right: "6%", fontSize: 10 } }] },
  { id: "b_sunset", cat: "bg", tier: 2, price: 70, name: "살구빛 노을", icon: "🌇", sp: [{ e: "🌤️", st: { top: "14%", right: "14%", fontSize: 12 } }] },
  { id: "b_sakura", cat: "bg", tier: 3, price: 150, name: "벚꽃 정원", icon: "🌸", sp: [{ e: "🌸", st: { top: "10%", left: "12%", fontSize: 12 } }, { e: "🌸", st: { top: "30%", right: "8%", fontSize: 9 } }, { e: "💮", st: { bottom: "18%", left: "16%", fontSize: 10 } }] },
  { id: "b_night", cat: "bg", tier: 3, price: 150, name: "별 헤는 밤", icon: "🌃", sp: [{ e: "✨", st: { top: "12%", left: "16%", fontSize: 10 } }, { e: "⭐", st: { top: "22%", right: "14%", fontSize: 9 } }, { e: "🌙", st: { top: "8%", right: "30%", fontSize: 12 } }] },
  { id: "b_aurora", cat: "bg", tier: 4, price: 450, name: "오로라의 밤", icon: "🌌", sp: [{ e: "✨", st: { top: "14%", left: "14%", fontSize: 10 } }, { e: "💫", st: { top: "26%", right: "12%", fontSize: 10 } }] },
  { id: "h_clip", cat: "head", tier: 1, price: 8, name: "노랑 실핀", icon: "📎", e: "🌟", st: { top: "2%", left: "26%", fontSize: 14, transform: "rotate(-20deg)" } },
  { id: "h_boww", cat: "head", tier: 1, price: 10, name: "하양 리본", icon: "🤍", svg: "bow_white" },
  { id: "h_daisy", cat: "head", tier: 2, price: 50, name: "데이지 핀", icon: "🌼", e: "🌼", st: { top: "0%", left: "24%", fontSize: 16, transform: "rotate(-12deg)" } },
  { id: "h_cat", cat: "head", tier: 3, price: 140, name: "고양이 귀", icon: "🐱", svg: "catears" },
  { id: "h_witch", cat: "head", tier: 3, price: 160, name: "마녀 모자", icon: "🎩", svg: "witch" },
  { id: "h_moon", cat: "head", tier: 4, price: 400, name: "초승달 왕관", icon: "🌙", svg: "mooncrown" },
  { id: "f_glow", cat: "face", tier: 2, price: 55, name: "볼 하이라이트", icon: "🌟", pair: true, e: "🌟", st: null, cls: "td-twk" },
  { id: "f_tears", cat: "face", tier: 3, price: 130, name: "별 눈물", icon: "💧", e: "⭐", st: { top: "60%", left: "34%", fontSize: 11 } },
  { id: "f_mask", cat: "face", tier: 2, price: 60, name: "잠자는 안대", icon: "😴", svg: "sleepmask" },
  { id: "n_bowtie", cat: "neck", tier: 1, price: 12, name: "나비 넥타이", icon: "🎀", e: "🎀", st: { bottom: "2%", left: "50%", transform: "translateX(-50%)", fontSize: 16 } },
  { id: "n_ribbon", cat: "neck", tier: 2, price: 50, name: "초커 리본", icon: "🏵️", svg: "choker" },
  { id: "n_heart", cat: "neck", tier: 3, price: 150, name: "하트 목걸이", icon: "💛", svg: "heartnk" },
  { id: "p_book", cat: "prop", tier: 1, price: 12, name: "동화책", icon: "📖", e: "📖" },
  { id: "p_cam", cat: "prop", tier: 1, price: 15, name: "레트로 카메라", icon: "📷", e: "📷" },
  { id: "p_star", cat: "prop", tier: 2, price: 55, name: "별 지팡이", icon: "⭐", e: "⭐", st: { bottom: "-6%", right: "-14%", fontSize: 24 }, cls: "td-twk" },
  { id: "p_moon", cat: "prop", tier: 3, price: 140, name: "달 조각", icon: "🌙", e: "🌙", st: { bottom: "-6%", right: "-14%", fontSize: 26 }, cls: "td-glow" },
  { id: "p_cake", cat: "prop", tier: 2, price: 60, name: "생일 케이크", icon: "🎂", e: "🎂" },
  { id: "p_planet", cat: "prop", tier: 4, price: 350, name: "작은 행성", icon: "🪐", e: "🪐", st: { bottom: "-6%", right: "-16%", fontSize: 28 }, cls: "td-spin" },
  { id: "a_music", cat: "aura", tier: 2, price: 50, name: "음표", icon: "🎵", ps: ["🎵", "🎶", "♪"] },
  { id: "a_leaf", cat: "aura", tier: 2, price: 45, name: "가을 낙엽", icon: "🍁", ps: ["🍁", "🍂", "🍃"] },
  { id: "a_fire", cat: "aura", tier: 3, price: 150, name: "불꽃 정령", icon: "🔥", ps: ["🔥", "✨", "🔥"] },
  { id: "a_diamond", cat: "aura", tier: 3, price: 160, name: "다이아 먼지", icon: "💎", ps: ["💎", "✨", "💠"] },
  { id: "a_galaxy", cat: "aura", tier: 4, price: 450, name: "은하수", icon: "🌌", ps: ["🌌", "⭐", "💫", "✨"], spd: 2 },
  { id: "a_rose", cat: "aura", tier: 3, price: 150, name: "장미 꽃잎", icon: "🌹", ps: ["🌹", "🥀", "🌹"] },
  { id: "fr_heart", cat: "frame", tier: 2, price: 70, name: "하트 테두리", icon: "💗" },
  { id: "fr_star", cat: "frame", tier: 3, price: 140, name: "별 테두리", icon: "⭐" },
  { id: "fr_fire", cat: "frame", tier: 4, price: 360, name: "불꽃 링", icon: "🔥" },
  { id: "fr_ice", cat: "frame", tier: 4, price: 360, name: "얼음 링", icon: "❄️" },
  { id: "b_ocean", cat: "bg", tier: 2, price: 65, name: "바닷속", icon: "🌊", sp: [{ e: "🐠", st: { top: "20%", left: "10%", fontSize: 12 } }, { e: "🫧", st: { bottom: "20%", right: "12%", fontSize: 10 } }] },
  { id: "b_forest", cat: "bg", tier: 3, price: 145, name: "숲속", icon: "🌲", sp: [{ e: "🌿", st: { bottom: "12%", left: "10%", fontSize: 13 } }, { e: "🍄", st: { bottom: "14%", right: "14%", fontSize: 11 } }] },
  { id: "b_space", cat: "bg", tier: 4, price: 480, name: "우주", icon: "🚀", sp: [{ e: "🪐", st: { top: "16%", right: "12%", fontSize: 14 } }, { e: "⭐", st: { top: "30%", left: "14%", fontSize: 9 } }, { e: "✨", st: { bottom: "20%", right: "20%", fontSize: 10 } }] },
  { id: "b_heart", cat: "bg", tier: 3, price: 150, name: "하트 가득", icon: "💕", sp: [{ e: "💗", st: { top: "16%", left: "14%", fontSize: 12 } }, { e: "💕", st: { top: "30%", right: "12%", fontSize: 10 } }, { e: "💓", st: { bottom: "18%", left: "18%", fontSize: 11 } }] },
  { id: "h_acrown", cat: "head", tier: 4, price: 500, name: "오로라 왕관", icon: "👑", svg: "acrown" },
  { id: "n_gem", cat: "neck", tier: 3, price: 160, name: "루비 펜던트", icon: "💎", svg: "gem" },
];
const ITEMS_BY_ID = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
const LEDGER_LABEL = { daily: "오늘 기록", weekly_sleepreg: "주간 수면 규칙성", weekly_exercise: "주간 운동 목표", monthly_bonus: "월간 개근 보너스", milestone_30: "30일 마일스톤", milestone_100: "100일 마일스톤", milestone_365: "365일 마일스톤" };
const GOALS_DATE = "__goals__";
const POINTS = { full: 10, partial: 2, weekly: 15, monthly: 100, m30: 50, m100: 200, m365: 1000 };
const dayOfYear = (dk) => { const [y, m, d] = dk.split("-").map(Number); return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000); };
const QUOTES = {
  a: {
    tired: ["잘 못 잔 밤도 몸은 기억하고 있어. 오늘은 무리하지 않아도 괜찮아.", "피곤함은 약점이 아니라 신호야. 오늘은 그 신호를 따라가봐.", "쉬어가는 것도 나아가는 방법 중 하나야.", "느린 아침이라고 나쁜 하루는 아니야.", "몸이 무거운 날엔, 마음이라도 가볍게 두자."],
    rested: ["잘 잔 아침은 그 자체로 하루의 절반을 이긴 거야.", "충전된 오늘, 무엇이든 시도해볼 만해.", "좋은 잠은 최고의 전략이었어.", "맑은 정신으로 시작하는 하루, 반갑다.", "오늘의 컨디션을 오늘 안에 다 쓸 필요는 없어. 천천히 써도 돼."],
    exercise: ["몸을 움직이는 건 마음을 정돈하는 일이기도 해.", "오늘은 몸에게 안부를 물어볼 차례야.", "작은 움직임이 큰 변화를 만든다는 걸, 넌 이미 알고 있잖아.", "땀 한 방울이 오늘의 생각을 더 또렷하게 해줄 거야.", "운동은 미래의 나에게 보내는 선물이야."],
    monday: ["한 주의 시작은 완벽할 필요 없어. 그냥 시작하면 돼.", "월요일의 무게는 누구에게나 있어. 너만 그런 게 아니야.", "새로운 7일, 어제와 다르게 살아볼 이유는 충분해.", "천천히 켜지는 엔진도 결국 잘 달려.", "이번 주도, 너답게."],
    weekend: ["주말엔 아무것도 안 해도 잘하고 있는 거야.", "쉼도 계획의 일부야.", "오늘은 시간에 쫓기지 않아도 되는 날.", "여백이 있어야 다음 문장을 쓸 수 있어.", "느긋함도 재능이야."],
    general: ["오늘 하루도, 있는 그대로 잘 지내보자.", "완벽한 하루보다, 솔직한 하루가 낫다.", "작게 쌓인 것들이 결국 단단한 걸 만들어.", "지금 이 순간에 집중하는 것만으로도 충분해.", "오늘의 나에게 조금 너그러워지자."],
  },
  b: {
    tired: ["어젯밤 잠이 부족했지? 오늘은 나한테 조금 기대도 돼 🤍", "피곤한 날엔 커피 한 잔이 우리 편이야 ☕", "무리하지 말고, 딱 할 수 있는 만큼만 하자!", "졸린 눈도 예뻐. 오늘 하루도 잘 부탁해 🌙", "잠이 부족해도, 넌 오늘도 충분히 잘하고 있어."],
    rested: ["잘 잤다니 완전 다행이야! 오늘 컨디션 최고겠다 ✨", "상쾌한 아침이네! 오늘 하루도 반짝반짝하자 🌟", "푹 잔 너, 오늘 뭘 해도 잘될 것 같아!", "좋은 잠은 좋은 하루의 시작! 오늘도 화이팅 💪", "컨디션 좋은 너를 보니까 나도 기분 좋다 😊"],
    exercise: ["오늘은 몸 움직이는 날! 살살 몸 풀어보자 🏃‍♀️", "운동하고 나면 기분이 뿅 좋아질 거야!", "오늘의 운동, 내가 옆에서 응원할게 📣", "땀 흘리고 난 뒤의 개운함, 기대해도 좋아!", "몸도 마음도 튼튼하게, 오늘도 화이팅!"],
    monday: ["월요일이지만 우리 씩씩하게 가보자! 🐣", "새로운 한 주, 좋은 일만 가득하길!", "월요병엔 애정이 특효약이래 (내가 방금 만든 말) 💕", "이번 주도 우리 잘 해낼 수 있어!", "월요일도 네 편이 있다는 거, 잊지 마 🤍"],
    weekend: ["주말이다! 오늘은 마음껏 게을러도 괜찮아 🛋️", "느긋한 하루 보내, 나도 같이 뒹굴거릴게 😌", "주말엔 뭐 하고 놀까, 생각만 해도 신나!", "푹 쉬는 것도 오늘의 할 일이야!", "주말 햇살처럼 나른하고 좋은 하루 보내 ☀️"],
    general: ["오늘 하루도 네가 있어서 든든해 🤍", "좋은 아침! 오늘도 예쁜 하루 보내자 🌸", "매일 조금씩 애쓰는 너, 진짜 멋져!", "오늘도 너의 하루를 응원할게!", "작은 일에도 웃을 수 있는 하루 되길!"],
  },
};
const weekMonday = (dk) => { const [y, m, d] = dk.split("-").map(Number); const dt = new Date(y, m - 1, d); const dow = (dt.getDay() + 6) % 7; return ymd(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - dow)); };
const monthFirst = (dk) => dk.slice(0, 7) + "-01";
const defaultGoal = () => ({ bedtime: "23:30", wake: "07:00", sleepHours: 7.5, exerciseWeekly: 4, exerciseDays: [], name: "" });
const VAPID_PUBLIC = "BOi2fKS_xvYbfB75PT7GWfxlY5H_bmxWA-1ySlFSRtCSKutpAB0Ux_MmuUUcp1WCqcxdQofsNv10K1mgvt34RwI";
const urlB64ToUint8 = (b64) => { const pad = "=".repeat((4 - (b64.length % 4)) % 4); const s = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/"); const raw = atob(s); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };

const THEME = {
  a: { name: "나", type: "불꽃", emoji: "🔥", c1: "#FF8A6B", c2: "#F4809E", soft: "#FFE3D6", soft2: "#FFF6EF", grat: "#FFF7EF", gratLine: "#F5E2CE", gratTxt: "#C98A4E", sky: "linear-gradient(180deg,#FFC9A8,#FF9E7C)", glowD: "#3a241c" },
  b: { name: "그대", type: "페어리", emoji: "✨", c1: "#F4809E", c2: "#A98BE0", soft: "#FDDDE6", soft2: "#FFF5F8", grat: "#FFF4F8", gratLine: "#F2D2DE", gratTxt: "#C4608A", sky: "linear-gradient(180deg,#FFC2D4,#D9A0E0)", glowD: "#33222e" },
};

const PALETTES = {
  coral: { c1: "#FF8A6B", c2: "#F4809E", soft: "#FFE3D6", soft2: "#FFF6EF", grat: "#FFF7EF", gratLine: "#F5E2CE", gratTxt: "#C98A4E", sky: "linear-gradient(180deg,#FFC9A8,#FF9E7C)", glowD: "#3a241c" },
  fairy: { c1: "#F4809E", c2: "#A98BE0", soft: "#FDDDE6", soft2: "#FFF5F8", grat: "#FFF4F8", gratLine: "#F2D2DE", gratTxt: "#C4608A", sky: "linear-gradient(180deg,#FFC2D4,#D9A0E0)", glowD: "#33222e" },
  lavender: { c1: "#A98BE0", c2: "#8B6FD0", soft: "#ECE2F9", soft2: "#F8F4FE", grat: "#F7F2FF", gratLine: "#DECEF0", gratTxt: "#7E5FC0", sky: "linear-gradient(180deg,#D4C2F2,#B69AE6)", glowD: "#261d38" },
  sky: { c1: "#6FB6D9", c2: "#4E97C4", soft: "#DCEEF6", soft2: "#F0F8FC", grat: "#F0F8FF", gratLine: "#CBE4F0", gratTxt: "#3F86B0", sky: "linear-gradient(180deg,#B3DCEF,#7FC0E0)", glowD: "#16283a" },
};
const CHARACTERS = {
  fire: { name: "불꽃이", emoji: "🔥" }, seal: { name: "물범이", emoji: "🦭" },
  bunny: { name: "토끼", emoji: "🐰" }, bear: { name: "곰돌이", emoji: "🐻" },
  star: { name: "별이", emoji: "⭐" }, cloud: { name: "구름이", emoji: "☁️" },
  cat: { name: "야옹이", emoji: "🐱" }, chick: { name: "삐약이", emoji: "🐤" },
};
// theme variables for light / night
const themeVars = (t, night) => {
  const base = { "--c1": t.c1, "--c2": t.c2, "--sky": t.sky, "--grattxt": t.gratTxt };
  if (!night) return {
    ...base, "--pageBg": t.soft2, "--glowc": t.soft, "--card": "#ffffff", "--field": "#ffffff",
    "--soft": t.soft, "--soft2": t.soft2, "--grat": t.grat, "--gratline": t.gratLine,
    "--ink": "#4A3F39", "--muted": "#B5A99E", "--line": "#F1E8DF", "--good": "#F0F8F1",
    "--glass": "rgba(255,255,255,.62)", "--shadow": "rgba(120,90,60,.10)",
  };
  return {
    ...base, "--pageBg": "#141221", "--glowc": t.glowD, "--card": "#252239", "--field": "#2c2a40",
    "--soft": "#3a3752", "--soft2": "#1f1d30", "--grat": "#2a2740", "--gratline": "#403a5e", "--grattxt": "#E7C46B",
    "--ink": "#ECE6DE", "--muted": "#A6A0BC", "--line": "rgba(255,255,255,.10)", "--good": "rgba(110,190,140,.14)",
    "--glass": "rgba(34,31,54,.66)", "--shadow": "rgba(0,0,0,.4)",
  };
};

function FireBuddy({ mood }) {
  const m = mood || "happy";
  return (
    <svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden="true">
      <path d="M40 6c6 12 2 16 8 22 4-2 6-7 5-12 9 9 14 20 14 30 0 16-12 28-27 28S13 62 13 46c0-11 7-21 16-28-1 6 1 11 5 13 4-7-1-13 6-25z" fill="#FF7043" />
      <path d="M40 30c4 6 2 9 5 13 2-1 3-4 3-7 5 6 8 12 8 18 0 9-7 16-16 16s-16-7-16-16c0-6 4-12 9-16-1 4 1 7 3 8 2-4-1-8 4-16z" fill="#FFCA28" />
      {m === "sleepy" && <path d="M29 52q4 4 8 0M43 52q4 4 8 0" stroke="#3a2a20" strokeWidth="2.4" fill="none" strokeLinecap="round" />}
      {m === "celebrate" && <path d="M29 53q4 -6 8 0M43 53q4 -6 8 0" stroke="#3a2a20" strokeWidth="2.8" fill="none" strokeLinecap="round" />}
      {m === "curious" && (<><circle cx="33" cy="52" r="4.6" fill="#3a2a20" /><circle cx="47" cy="52" r="4.6" fill="#3a2a20" /><circle cx="34.5" cy="50.3" r="1.7" fill="#fff" /><circle cx="48.5" cy="50.3" r="1.7" fill="#fff" /></>)}
      {m === "happy" && (<><circle cx="33" cy="52" r="4.2" fill="#3a2a20" /><circle cx="47" cy="52" r="4.2" fill="#3a2a20" /><circle cx="34.2" cy="50.6" r="1.4" fill="#fff" /><circle cx="48.2" cy="50.6" r="1.4" fill="#fff" /></>)}
      <ellipse cx="27" cy="58" rx="3.4" ry="2" fill="#FF8A65" opacity={m === "celebrate" ? ".95" : ".7"} />
      <ellipse cx="53" cy="58" rx="3.4" ry="2" fill="#FF8A65" opacity={m === "celebrate" ? ".95" : ".7"} />
      {m === "sleepy" && <path d="M38 59h4" stroke="#3a2a20" strokeWidth="2" fill="none" strokeLinecap="round" />}
      {m === "celebrate" && <path d="M35 57q5 6.5 10 0" stroke="#3a2a20" strokeWidth="2.4" fill="none" strokeLinecap="round" />}
      {m === "curious" && <circle cx="40" cy="59" r="2.6" fill="none" stroke="#3a2a20" strokeWidth="2" />}
      {m === "happy" && <path d="M37 58q3 3 6 0" stroke="#3a2a20" strokeWidth="2" fill="none" strokeLinecap="round" />}
    </svg>
  );
}
function CountUp({ value, format }) {
  const [disp, setDisp] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const from = prevRef.current, to = value; prevRef.current = to;
    if (from === to) { setDisp(to); return; }
    const t0 = performance.now(), dur = 650; let raf;
    const step = (t) => { const p = Math.min(1, (t - t0) / dur); const ease = 1 - Math.pow(1 - p, 3); setDisp(Math.round(from + (to - from) * ease)); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format ? format(disp) : disp}</>;
}
const relTime = (ts) => { const s = (Date.now() - new Date(ts).getTime()) / 1000; if (s < 120) return "방금 전"; if (s < 3600) return `${Math.floor(s / 60)}분 전`; if (s < 86400) return `${Math.floor(s / 3600)}시간 전`; return `${Math.floor(s / 86400)}일 전`; };
function FairyBuddy() { return <img src="/seal.jpg" alt="지인" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />; }
function CharFace({ mood }) {
  const m = mood || "happy";
  return (<g>
    {m === "sleepy" && <path d="M29 52q4 4 8 0M43 52q4 4 8 0" stroke="#3a2a20" strokeWidth="2.4" fill="none" strokeLinecap="round" />}
    {m === "celebrate" && <path d="M29 53q4 -6 8 0M43 53q4 -6 8 0" stroke="#3a2a20" strokeWidth="2.8" fill="none" strokeLinecap="round" />}
    {m === "curious" && (<><circle cx="33" cy="52" r="4.6" fill="#3a2a20" /><circle cx="47" cy="52" r="4.6" fill="#3a2a20" /><circle cx="34.5" cy="50.3" r="1.7" fill="#fff" /><circle cx="48.5" cy="50.3" r="1.7" fill="#fff" /></>)}
    {m === "happy" && (<><circle cx="33" cy="52" r="4.2" fill="#3a2a20" /><circle cx="47" cy="52" r="4.2" fill="#3a2a20" /><circle cx="34.2" cy="50.6" r="1.4" fill="#fff" /><circle cx="48.2" cy="50.6" r="1.4" fill="#fff" /></>)}
    <ellipse cx="27" cy="58" rx="3.4" ry="2" fill="#FF9FB0" opacity={m === "celebrate" ? ".9" : ".6"} />
    <ellipse cx="53" cy="58" rx="3.4" ry="2" fill="#FF9FB0" opacity={m === "celebrate" ? ".9" : ".6"} />
    {m === "sleepy" && <path d="M38 59h4" stroke="#3a2a20" strokeWidth="2" fill="none" strokeLinecap="round" />}
    {m === "celebrate" && <path d="M35 57q5 6.5 10 0" stroke="#3a2a20" strokeWidth="2.4" fill="none" strokeLinecap="round" />}
    {m === "curious" && <circle cx="40" cy="59" r="2.6" fill="none" stroke="#3a2a20" strokeWidth="2" />}
    {m === "happy" && <path d="M37 58q3 3 6 0" stroke="#3a2a20" strokeWidth="2" fill="none" strokeLinecap="round" />}
  </g>);
}
const CHAR_BODIES = {
  bunny: (<g><ellipse cx="28" cy="18" rx="8" ry="17" fill="#FDFDFD" stroke="#EADFDA" strokeWidth="1.5" /><ellipse cx="28" cy="20" rx="4" ry="11" fill="#FFD3DE" /><ellipse cx="52" cy="18" rx="8" ry="17" fill="#FDFDFD" stroke="#EADFDA" strokeWidth="1.5" /><ellipse cx="52" cy="20" rx="4" ry="11" fill="#FFD3DE" /><circle cx="40" cy="50" r="25" fill="#FDFDFD" stroke="#EADFDA" strokeWidth="1.5" /></g>),
  bear: (<g><circle cx="20" cy="30" r="10" fill="#B98A64" /><circle cx="20" cy="30" r="5.5" fill="#E8C6A8" /><circle cx="60" cy="30" r="10" fill="#B98A64" /><circle cx="60" cy="30" r="5.5" fill="#E8C6A8" /><circle cx="40" cy="50" r="25" fill="#C89A72" /><ellipse cx="40" cy="60" rx="10" ry="8" fill="#E8C6A8" /></g>),
  star: (<g><path d="M40 8 L48 34 L75 35 L53 51 L61 76 L40 61 L19 76 L27 51 L5 35 L32 34 Z" fill="#FFD35C" stroke="#EAB93C" strokeWidth="2" strokeLinejoin="round" /></g>),
  cloud: (<g><ellipse cx="40" cy="55" rx="30" ry="19" fill="#FDFDFF" stroke="#DFE4F0" strokeWidth="1.5" /><circle cx="24" cy="44" r="13" fill="#FDFDFF" /><circle cx="42" cy="37" r="16" fill="#FDFDFF" /><circle cx="57" cy="45" r="12" fill="#FDFDFF" /></g>),
  cat: (<g><path d="M18 34 L14 10 L34 24 Z" fill="#A8B4C4" /><path d="M20 30 L18 15 L30 24 Z" fill="#F3D9E4" /><path d="M62 34 L66 10 L46 24 Z" fill="#A8B4C4" /><path d="M60 30 L62 15 L50 24 Z" fill="#F3D9E4" /><circle cx="40" cy="50" r="25" fill="#B8C4D4" /><path d="M8 52 L22 55 M8 60 L22 60 M72 52 L58 55 M72 60 L58 60" stroke="#8A96A8" strokeWidth="1.6" strokeLinecap="round" /></g>),
  chick: (<g><circle cx="40" cy="50" r="25" fill="#FFDD57" stroke="#EFC23C" strokeWidth="1.5" /><path d="M37 24 q3 -9 6 0" stroke="#EFC23C" strokeWidth="2.5" fill="none" strokeLinecap="round" /><ellipse cx="16" cy="56" rx="6" ry="10" fill="#FFD35C" transform="rotate(18 16 56)" /><ellipse cx="64" cy="56" rx="6" ry="10" fill="#FFD35C" transform="rotate(-18 64 56)" /></g>),
};
function Character({ id, mood }) {
  const cid = id || "fire";
  if (cid === "fire") return <FireBuddy mood={mood} />;
  if (cid === "seal") return <FairyBuddy />;
  const body = CHAR_BODIES[cid];
  if (!body) return <FireBuddy mood={mood} />;
  return <svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden="true">{body}<CharFace mood={mood} /></svg>;
}

const SVGS = {
  bow_pink: () => (<svg className="td-sv" style={{ top: "-16%", left: "50%", transform: "translateX(-50%) rotate(-8deg)", width: "54%" }} viewBox="0 0 60 34"><path d="M30 17 L9 5 Q2 2 2 10 L2 24 Q2 32 9 29 L30 17Z" fill="#FF8FB3" /><path d="M30 17 L51 5 Q58 2 58 10 L58 24 Q58 32 51 29 L30 17Z" fill="#FF8FB3" /><circle cx="30" cy="17" r="6.5" fill="#E4568C" /></svg>),
  bow_blue: () => (<svg className="td-sv" style={{ top: "-16%", left: "50%", transform: "translateX(-50%) rotate(-8deg)", width: "54%" }} viewBox="0 0 60 34"><path d="M30 17 L9 5 Q2 2 2 10 L2 24 Q2 32 9 29 L30 17Z" fill="#8FC7FF" /><path d="M30 17 L51 5 Q58 2 58 10 L58 24 Q58 32 51 29 L30 17Z" fill="#8FC7FF" /><circle cx="30" cy="17" r="6.5" fill="#4E8FD9" /></svg>),
  beret: () => (<svg className="td-sv" style={{ top: "-15%", left: "48%", transform: "translateX(-50%) rotate(-10deg)", width: "62%" }} viewBox="0 0 70 34"><ellipse cx="35" cy="24" rx="33" ry="11" fill="#D64550" /><ellipse cx="35" cy="17" rx="26" ry="12" fill="#E85963" /><rect x="33" y="2" width="4" height="8" rx="2" fill="#B93A44" /></svg>),
  bear: () => (<svg className="td-sv" style={{ top: "-12%", left: "50%", transform: "translateX(-50%)", width: "84%" }} viewBox="0 0 100 30"><circle cx="18" cy="16" r="13" fill="#B98A64" /><circle cx="18" cy="16" r="7" fill="#E8C6A8" /><circle cx="82" cy="16" r="13" fill="#B98A64" /><circle cx="82" cy="16" r="7" fill="#E8C6A8" /></svg>),
  fcrown: () => (<svg className="td-sv" style={{ top: "-11%", left: "50%", transform: "translateX(-50%)", width: "80%" }} viewBox="0 0 90 26"><path d="M6 20 Q45 4 84 20" stroke="#7FBF8E" strokeWidth="5" fill="none" strokeLinecap="round" />{[14, 32, 45, 58, 76].map((x, i) => (<g key={i}><circle cx={x} cy={i % 2 ? 11 : 15} r="6" fill={i % 2 ? "#FFB6D2" : "#FFD6E8"} /><circle cx={x} cy={i % 2 ? 11 : 15} r="2.4" fill="#F6C453" /></g>))}</svg>),
  tiara: () => (<svg className="td-sv td-twk" style={{ top: "-20%", left: "50%", transform: "translateX(-50%)", width: "56%" }} viewBox="0 0 64 34"><path d="M4 30 L10 10 L22 24 L32 4 L42 24 L54 10 L60 30 Z" fill="#F6C453" stroke="#E0A23B" strokeWidth="2" strokeLinejoin="round" /><circle cx="32" cy="12" r="3.4" fill="#FF6FA5" className="td-twk" /><circle cx="32" cy="12" r="5.8" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity=".75" className="td-twk" /><circle cx="13" cy="18" r="2.4" fill="#6EC5FF" className="td-twk" /><circle cx="51" cy="18" r="2.4" fill="#8FE39B" className="td-twk" /></svg>),
  halo: () => (<svg className="td-sv td-halofloat" style={{ top: "-25%", left: "50%", transform: "translateX(-50%)", width: "52%" }} viewBox="0 0 60 18"><ellipse cx="30" cy="9" rx="26" ry="7" fill="none" stroke="#FFD874" strokeWidth="5" /><ellipse cx="30" cy="9" rx="26" ry="7" fill="none" stroke="#FFF3C4" strokeWidth="2" /></svg>),
  blush: () => (<svg className="td-sv" style={{ top: "56%", left: "50%", transform: "translateX(-50%)", width: "78%" }} viewBox="0 0 90 20"><ellipse cx="16" cy="10" rx="11" ry="6" fill="#FF9FB0" opacity=".55" /><ellipse cx="74" cy="10" rx="11" ry="6" fill="#FF9FB0" opacity=".55" /></svg>),
  glasses: () => (<svg className="td-sv" style={{ top: "46%", left: "50%", transform: "translateX(-50%)", width: "64%" }} viewBox="0 0 80 26"><circle cx="20" cy="13" r="11" fill="rgba(255,255,255,.22)" stroke="#5B4A3F" strokeWidth="3" /><circle cx="60" cy="13" r="11" fill="rgba(255,255,255,.22)" stroke="#5B4A3F" strokeWidth="3" /><path d="M31 13 Q40 7 49 13" stroke="#5B4A3F" strokeWidth="3" fill="none" /></svg>),
  tie: () => (<svg className="td-sv" style={{ bottom: "-3%", left: "50%", transform: "translateX(-50%)", width: "34%" }} viewBox="0 0 40 22"><path d="M20 11 L4 3 Q1 2 1 6 L1 16 Q1 20 4 19 L20 11Z" fill="#E4568C" /><path d="M20 11 L36 3 Q39 2 39 6 L39 16 Q39 20 36 19 L20 11Z" fill="#E4568C" /><circle cx="20" cy="11" r="4" fill="#B03A6B" /></svg>),
  scarf: () => (<svg className="td-sv" style={{ bottom: "-5%", left: "50%", transform: "translateX(-50%)", width: "92%" }} viewBox="0 0 100 32"><defs><pattern id="gschk" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="4.5" height="9" fill="rgba(255,255,255,.4)" /></pattern></defs><path d="M6 8 Q50 22 94 8 L94 16 Q50 30 6 16 Z" fill="#D64550" /><path d="M6 8 Q50 22 94 8 L94 16 Q50 30 6 16 Z" fill="url(#gschk)" /><rect x="60" y="14" width="12" height="16" rx="3" fill="#D64550" /></svg>),
  pearl: () => (<svg className="td-sv" style={{ bottom: "1%", left: "50%", transform: "translateX(-50%)", width: "68%" }} viewBox="0 0 80 22">{[0, 1, 2, 3, 4, 5, 6].map((i) => { const x = 10 + i * 10; const y = 7 + Math.sin((i / 6) * Math.PI) * 9; return <circle key={i} cx={x} cy={y} r="3.6" fill="#FDF6EC" stroke="#E0D2BE" strokeWidth="1" />; })}</svg>),
  aurorascarf: () => (<svg className="td-sv td-hue" style={{ bottom: "-5%", left: "50%", transform: "translateX(-50%)", width: "92%" }} viewBox="0 0 100 26"><defs><linearGradient id="gsaur" x1="0" x2="1"><stop offset="0" stopColor="#8FD3FF" /><stop offset=".5" stopColor="#C9A6FF" /><stop offset="1" stopColor="#FF9EC1" /></linearGradient></defs><path d="M6 6 Q50 20 94 6 L94 15 Q50 29 6 15Z" fill="url(#gsaur)" /></svg>),
  bow_white: () => (<svg className="td-sv" style={{ top: "-16%", left: "50%", transform: "translateX(-50%) rotate(-8deg)", width: "54%" }} viewBox="0 0 60 34"><path d="M30 17 L9 5 Q2 2 2 10 L2 24 Q2 32 9 29 L30 17Z" fill="#FFFFFF" stroke="#E8D9E0" strokeWidth="1.5" /><path d="M30 17 L51 5 Q58 2 58 10 L58 24 Q58 32 51 29 L30 17Z" fill="#FFFFFF" stroke="#E8D9E0" strokeWidth="1.5" /><circle cx="30" cy="17" r="6.5" fill="#F0E4EA" /></svg>),
  catears: () => (<svg className="td-sv" style={{ top: "-16%", left: "50%", transform: "translateX(-50%)", width: "78%" }} viewBox="0 0 90 30"><path d="M14 28 L10 4 L30 20 Z" fill="#C9A4E0" /><path d="M16 25 L14 10 L26 20 Z" fill="#F3D9F0" /><path d="M76 28 L80 4 L60 20 Z" fill="#C9A4E0" /><path d="M74 25 L76 10 L64 20 Z" fill="#F3D9F0" /></svg>),
  witch: () => (<svg className="td-sv" style={{ top: "-30%", left: "50%", transform: "translateX(-50%) rotate(6deg)", width: "58%" }} viewBox="0 0 60 44"><ellipse cx="30" cy="40" rx="28" ry="5" fill="#3A2A55" /><path d="M18 40 Q22 8 42 3 Q30 22 42 40 Z" fill="#4A3570" /><path d="M20 33 Q30 30 40 33 L40 37 Q30 34 20 37 Z" fill="#B57BD6" /><circle cx="35" cy="16" r="2.6" fill="#FFD874" /></svg>),
  mooncrown: () => (<svg className="td-sv td-halofloat" style={{ top: "-22%", left: "50%", transform: "translateX(-50%)", width: "60%" }} viewBox="0 0 64 30"><path d="M6 28 Q6 6 26 6 Q16 16 26 28 Z" fill="#FFE08A" /><path d="M58 28 Q58 6 38 6 Q48 16 38 28 Z" fill="#FFE08A" /><circle cx="32" cy="9" r="5" fill="#C9A6FF" /><circle cx="32" cy="9" r="2" fill="#fff" /></svg>),
  sleepmask: () => (<svg className="td-sv" style={{ top: "44%", left: "50%", transform: "translateX(-50%)", width: "66%" }} viewBox="0 0 80 22"><rect x="6" y="4" width="68" height="15" rx="7.5" fill="#B29CE0" /><path d="M20 12 q5 4 10 0M50 12 q5 4 10 0" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>),
  choker: () => (<svg className="td-sv" style={{ bottom: "0%", left: "50%", transform: "translateX(-50%)", width: "72%" }} viewBox="0 0 80 16"><rect x="4" y="6" width="72" height="5" rx="2.5" fill="#E4568C" /><circle cx="40" cy="8.5" r="5" fill="#FF8FB3" /><circle cx="40" cy="8.5" r="2" fill="#fff" /></svg>),
  heartnk: () => (<svg className="td-sv" style={{ bottom: "-2%", left: "50%", transform: "translateX(-50%)", width: "60%" }} viewBox="0 0 70 26"><path d="M6 4 Q35 16 64 4" stroke="#F6C453" strokeWidth="2" fill="none" /><path d="M35 12 q-6 -7 -11 -1 q-3 4 11 11 q14 -7 11 -11 q-5 -6 -11 1Z" fill="#FFC93C" /></svg>),
  acrown: () => (<svg className="td-sv td-hue" style={{ top: "-22%", left: "50%", transform: "translateX(-50%)", width: "58%" }} viewBox="0 0 64 34"><defs><linearGradient id="gsac" x1="0" x2="1"><stop offset="0" stopColor="#8FD3FF" /><stop offset=".5" stopColor="#C9A6FF" /><stop offset="1" stopColor="#FF9EC1" /></linearGradient></defs><path d="M6 30 L10 8 L20 20 L32 4 L44 20 L54 8 L58 30 Z" fill="url(#gsac)" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /><circle cx="32" cy="24" r="3" fill="#fff" opacity=".9" className="td-twk" /></svg>),
  gem: () => (<svg className="td-sv" style={{ bottom: "-1%", left: "50%", transform: "translateX(-50%)", width: "50%" }} viewBox="0 0 60 24"><path d="M6 3 Q30 13 54 3" stroke="#E8D9C8" strokeWidth="2" fill="none" /><path d="M30 10 L24 15 L30 22 L36 15 Z" fill="#E4386B" className="td-twk" /><path d="M26 12 L34 12 L30 10 Z" fill="#FF7FA0" /></svg>),
};
function ItemThumb({ it }) {
  if (it.svg) { const C = SVGS[it.svg]; return <span className="td-thumb">{C ? <C /> : null}</span>; }
  if (it.cat === "bg") return <span className={"td-thumb td-thumbbg abg-" + it.id} />;
  if (it.cat === "frame") return (<span className="td-thumb"><span className={"td-avatar frame-" + it.id}><span className="td-avatarinner td-fprevdot" /></span></span>);
  if (it.ps) return <span className="td-thumb td-thumbaura">{it.ps.slice(0, 3).map((p, i) => <i key={i}>{p}</i>)}</span>;
  return <span className="td-thumb td-thumbemoji">{it.e || it.icon}</span>;
}
function ItemNode({ it }) {
  if (!it) return null;
  if (it.svg) { const C = SVGS[it.svg]; return C ? <C /> : null; }
  if (it.pair) return (<><span className={"td-itm td-cheekL " + (it.cls || "") + (it.tier >= 3 ? " td-tg" + it.tier : "")}>{it.e}</span><span className={"td-itm td-cheekR " + (it.cls || "") + (it.tier >= 3 ? " td-tg" + it.tier : "")}>{it.e}</span></>);
  if (it.e) return <span className={"td-itm td-itm-" + it.cat + (it.cls ? " " + it.cls : "") + (it.tier >= 3 ? " td-tg" + it.tier : "")} style={it.st}>{it.e}</span>;
  return null;
}
function AvatarDeco({ avatar, owned, tryOn, children, big }) {
  const eq = { ...(avatar || {}), ...(tryOn || {}) };
  const pick = (cat) => {
    const id = eq[cat]; if (!id) return null;
    const it = ITEMS_BY_ID[id]; if (!it) return null;
    if (!(tryOn && tryOn[cat] === id) && owned && !owned.has(id)) return null;
    return it;
  };
  const head = pick("head"), face = pick("face"), neck = pick("neck"), prop = pick("prop"), aura = pick("aura"), frame = pick("frame"), bg = pick("bg");
  const N = big ? 8 : 6;
  return (
    <div className={"td-avatar frame-" + (frame ? frame.id : "none") + (big ? " big" : "") + (bg ? " hasbg" : "")}>
      <div className="td-avatarinner">
        {bg && <div className={"td-abg abg-" + bg.id}>{(bg.sp || []).map((s, i) => <span key={i} style={s.st}>{s.e}</span>)}</div>}
        {children}
        <ItemNode it={face} />
        <ItemNode it={neck} />
      </div>
      <ItemNode it={head} />
      <ItemNode it={prop} />
      {aura && (
        <div className={"td-aura spd" + (aura.spd || 1)}>
          {[...Array(N)].map((_, i) => <span key={i} style={{ "--i": i, "--n": N, "--dl": (i * 0.4) + "s" }}>{aura.ps[i % aura.ps.length]}</span>)}
        </div>
      )}
    </div>
  );
}
function UnboxOverlay({ data, names, onClose, onOpened }) {
  const [opened, setOpened] = useState(false);
  const it = data.item;
  return (
    <div className="td-bigceleb" onClick={() => { if (opened) onClose(); }}>
      {!opened ? (
        <button className="td-unboxbox" onClick={(ev) => { ev.stopPropagation(); setOpened(true); if (onOpened) onOpened(); try { navigator.vibrate && navigator.vibrate([60, 40, 90]); } catch (e2) {} }}>🎁<span>탭해서 열기</span></button>
      ) : (
        <div className={"td-unboxreveal tier" + it.tier}>
          <div className="td-unboxglow" />
          <span className="td-unboxemoji">{it.icon || it.e || "🎀"}</span>
          <h2>{it.name}</h2>
          <p>{TIER_NAMES[it.tier]}{data.giftedBy ? ` · ${names[data.giftedBy]}의 선물 💝` : " 획득!"}</p>
          {data.note && <p className="td-unboxnote">“{data.note}”</p>}
          <span className="td-bigclose">화면을 탭하면 닫혀요</span>
        </div>
      )}
    </div>
  );
}
const LS_CODE = "couple-code", LS_ME = "couple-me", LS_NIGHT = "couple-night";

export default function Page() {
  const [code, setCode] = useState(null);
  const [me, setMe] = useState("a");
  const [ready, setReady] = useState(false);
  const [night, setNight] = useState(false);
  const [view, setView] = useState("today"); // today | review | calendar
  const [codeInput, setCodeInput] = useState("");
  const [meInput, setMeInput] = useState("a");

  const [days, setDays] = useState({});
  const [goals, setGoals] = useState({ a: defaultGoal(), b: defaultGoal() });
  const [date, setDate] = useState(today());
  const [page, setPage] = useState("a");
  const [loading, setLoading] = useState(true);
  const [showGoals, setShowGoals] = useState(false);
  const [monthRef, setMonthRef] = useState(today());
  const [burstKey, setBurstKey] = useState(0);
  const [celebrate, setCelebrate] = useState(null); // {key,msg}
  const [pushState, setPushState] = useState("loading"); // loading|unsupported|off|on|denied|busy
  const [pushMsg, setPushMsg] = useState("");
  const [savedFlash, setSavedFlash] = useState(null);
  const [openSet, setOpenSet] = useState({});
  const [lastSeen, setLastSeen] = useState({ a: null, b: null });
  const [bigCeleb, setBigCeleb] = useState(null);
  const [messages, setMessages] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [qInput, setQInput] = useState("");
  const [cheerText, setCheerText] = useState("");
  const [showCheerBox, setShowCheerBox] = useState(false);
  const [letterInput, setLetterInput] = useState({ msg: "", date: "" });
  const [giftInput, setGiftInput] = useState("");
  const [openLetter, setOpenLetter] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [styleSub, setStyleSub] = useState("closet");
  const [shopCat, setShopCat] = useState("");
  const [tryOn, setTryOn] = useState({});
  const [unbox, setUnbox] = useState(null);
  const [giftItem, setGiftItem] = useState(null);
  const [giftNote, setGiftNote] = useState("");
  const [gachaResult, setGachaResult] = useState(null);
  const [gachaRolling, setGachaRolling] = useState(false);
  const [ledger, setLedger] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [redeems, setRedeems] = useState([]);
  const [newReward, setNewReward] = useState({ emoji: "🎁", title: "", cost: "" });
  const [redeemMsg, setRedeemMsg] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [shopEdit, setShopEdit] = useState(false);
  const [initFilled, setInitFilled] = useState({});
  const saveTimers = useRef({});

  // ---- Phase 2: Auth (병행 모드) ----
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [linkCodeInput, setLinkCodeInput] = useState("");
  const [linkSlotInput, setLinkSlotInput] = useState("a");
  const [linkMsg, setLinkMsg] = useState("");
  const [linking, setLinking] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  // ---- PWA 홈 화면 설치 유도 ----
  const [installEvt, setInstallEvt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [iosGuide, setIosGuide] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (isStandalone) return; // 이미 설치됨
    let dismissed = false;
    try { dismissed = localStorage.getItem("gs_install_dismissed") === "1"; } catch (e) {}
    if (dismissed) return;

    const ua = window.navigator.userAgent || "";
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isSafari = isIOS && /safari/i.test(ua) && !/crios|fxios/i.test(ua);

    const handler = (e) => { e.preventDefault(); setInstallEvt(e); setShowInstall(true); };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS는 beforeinstallprompt 미지원 → Safari면 수동 안내 노출
    if (isIOS && isSafari) { setShowInstall(true); setIosGuide(true); }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const doInstall = async () => {
    if (installEvt) {
      installEvt.prompt();
      try { await installEvt.userChoice; } catch (e) {}
      setInstallEvt(null); setShowInstall(false);
    } else if (iosGuide) {
      // 안내 모달만 토글 (배너 자체가 안내)
    }
  };
  const dismissInstall = () => { setShowInstall(false); try { localStorage.setItem("gs_install_dismissed", "1"); } catch (e) {} };

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const inv = params.get("invite");
      if (inv) {
        setInviteCode(inv.trim());
        setLinkCodeInput(inv.trim());
        setCodeInput(inv.trim());
        setLinkSlotInput("b"); // 초대받은 쪽은 보통 b 슬롯 (만든 사람이 a)
        setMeInput("b");
        const url = new URL(window.location.href);
        url.searchParams.delete("invite");
        window.history.replaceState({}, "", url.toString());
      }
    } catch (e) {}
  }, []);

  const checkWhoami = useCallback(async () => {
    const { data, error } = await supabase.rpc("gs_whoami");
    const row = !error && data && data[0];
    if (row && row.slot) {
      try { localStorage.setItem(LS_CODE, row.couple_code); localStorage.setItem(LS_ME, row.slot); } catch (e) {}
      setCode(row.couple_code); setMe(row.slot); setPage(row.slot);
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      if (data.session) checkWhoami().then(() => setAuthChecked(true));
      else setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) checkWhoami();
    });
    return () => { sub && sub.subscription && sub.subscription.unsubscribe(); };
  }, [checkWhoami]);

  const loginWithGoogle = () => {
    supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
  };

  // ---- 이메일/비밀번호 (앱 전용 계정) ----
  const [authMode, setAuthMode] = useState("signin"); // signin | signup
  const [emailInput, setEmailInput] = useState("");
  const [pwInput, setPwInput] = useState("");
  const [pw2Input, setPw2Input] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);

  const emailAuth = async () => {
    const em = emailInput.trim(); const pw = pwInput;
    if (!em || !pw) { setAuthMsg("이메일과 비밀번호를 입력해주세요."); return; }
    if (authMode === "signup") {
      if (pw.length < 6) { setAuthMsg("비밀번호는 6자 이상이어야 해요."); return; }
      if (pw !== pw2Input) { setAuthMsg("비밀번호가 서로 달라요."); return; }
    }
    setAuthBusy(true); setAuthMsg("");
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email: em, password: pw });
      setAuthBusy(false);
      if (error) { setAuthMsg(error.message.includes("already registered") ? "이미 가입된 이메일이에요. 로그인해주세요." : "가입에 실패했어요: " + error.message); return; }
      if (data.session) { setSession(data.session); }
      else { setAuthMsg("확인 메일을 보냈어요! 메일함에서 인증 후 로그인해주세요."); setAuthMode("signin"); }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
      setAuthBusy(false);
      if (error) { setAuthMsg(error.message.includes("Invalid login") ? "이메일 또는 비밀번호가 틀렸어요." : error.message.includes("not confirmed") ? "메일 인증이 아직 안 됐어요. 메일함을 확인해주세요." : "로그인에 실패했어요."); return; }
      setSession(data.session);
    }
  };

  const linkCouple = async () => {
    const c = linkCodeInput.trim();
    if (!c) return;
    setLinking(true); setLinkMsg("");
    const { data, error } = await supabase.rpc("gs_link_couple", { p_code: c, p_slot: linkSlotInput });
    setLinking(false);
    if (error || !data || !data.ok) {
      const reason = (data && data.reason) || "error";
      const msgMap = { code_not_found: "코드를 찾을 수 없어요.", slot_taken: "이미 다른 계정이 이 슬롯을 쓰고 있어요.", bad_slot: "슬롯을 선택해주세요." };
      setLinkMsg(msgMap[reason] || "연결에 실패했어요.");
      return;
    }
    try { localStorage.setItem(LS_CODE, data.couple_code); localStorage.setItem(LS_ME, data.slot); } catch (e) {}
    setCode(data.couple_code); setMe(data.slot); setPage(data.slot);
  };

  const logoutAuth = async () => { await supabase.auth.signOut(); setSession(null); logout(); };

  const [pendingInvite, setPendingInvite] = useState(null); // {code, slot}

  const createCouple = async () => {
    if (!window.confirm("새 커플을 만들면 새 코드가 생성돼요.\n\n이미 쓰던 기록이 있다면 '새 커플 만들기'가 아니라, 위에 기존 공유 코드를 입력해서 '코드로 연결하기'를 눌러주세요!\n\n정말 새로 만들까요?")) return;
    setLinking(true); setLinkMsg("");
    const { data, error } = await supabase.rpc("gs2_create_couple", { p_slot: linkSlotInput });
    setLinking(false);
    if (error || !data || !data.ok) {
      if (data && data.reason === "has_history") {
        // 예전에 쓰던 커플이 있음 → 새로 만들지 말고 복귀 유도
        setLinkCodeInput(data.couple_code);
        setLinkSlotInput(data.slot);
        setLinkMsg(`예전에 쓰던 코드(${data.couple_code})가 있어요! 위 '코드로 연결하기'를 눌러 기존 기록을 이어가세요.`);
        return;
      }
      setLinkMsg(data && data.reason === "already_linked" ? "이미 연결된 계정이에요." : "커플 생성에 실패했어요.");
      return;
    }
    try { localStorage.setItem(LS_CODE, data.couple_code); localStorage.setItem(LS_ME, data.slot); } catch (e) {}
    setPendingInvite({ code: data.couple_code, slot: data.slot });
  };

  const enterApp = () => {
    if (!pendingInvite) return;
    setCode(pendingInvite.code); setMe(pendingInvite.slot); setPage(pendingInvite.slot);
    setPendingInvite(null);
  };

  const shareInvite = async (coupleCode) => {
    const url = `${window.location.origin}/?invite=${encodeURIComponent(coupleCode)}`;
    const text = `우리의 하루에서 같이 기록해요! 아래 링크로 들어와줘 💌`;
    if (navigator.share) {
      try { await navigator.share({ title: "우리의 하루 초대", text, url }); return; } catch (e) {}
    }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); setLinkMsg("초대 링크를 복사했어요! 카톡 등에 붙여넣어주세요."); }
    catch (e) { setLinkMsg("링크: " + url); }
  };

  useEffect(() => {
    try {
      const c = localStorage.getItem(LS_CODE); const m = localStorage.getItem(LS_ME); const n = localStorage.getItem(LS_NIGHT);
      if (c) { setCode(c); setPage(m === "b" ? "b" : "a"); setMe(m === "b" ? "b" : "a"); }
      if (n === "1") setNight(true); else if (n === "0") setNight(false);
      else { const h = new Date().getHours(); if (h >= 20 || h < 6) setNight(true); }
    } catch (e) {}
    setReady(true);
  }, []);

  // register service worker + detect push capability/state
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setPushState("unsupported"); return; }
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      try {
        const sub = await reg.pushManager.getSubscription();
        if (Notification.permission === "denied") setPushState("denied");
        else setPushState(sub ? "on" : "off");
      } catch (e) { setPushState("off"); }
    }).catch(() => setPushState("unsupported"));
  }, []);

  const toggleNight = () => setNight((v) => { const nv = !v; try { localStorage.setItem(LS_NIGHT, nv ? "1" : "0"); } catch (e) {} return nv; });

  useEffect(() => {
    if (!code) return;
    let alive = true;
    const parseRows = (rows) => {
      const nd = {}, ng = { a: defaultGoal(), b: defaultGoal() }; const ls = { a: null, b: null };
      (rows || []).forEach((r) => {
        if (r.date === GOALS_DATE) ng[r.slot] = { ...defaultGoal(), ...(r.data || {}) };
        else {
          nd[r.date] = nd[r.date] || {}; nd[r.date][r.slot] = entryFromRow(r);
          if (r.updated_at && (!ls[r.slot] || r.updated_at > ls[r.slot])) ls[r.slot] = r.updated_at;
        }
      });
      return { nd, ng, ls };
    };
    const load = async (initial) => {
      const { data: rows, error } = await supabase.rpc("gs2_get", { p_code: code });
      if (!alive) return;
      if (error) { if (initial) setLoading(false); return; }
      const { nd, ng, ls } = parseRows(rows);
      if (initial) { setDays(nd); setGoals(ng); setLoading(false);
        if (!rows || rows.length === 0) supabase.rpc("gs2_kiss_award", { p_code: code, p_slot: me, p_delta: 120, p_reason: "welcome_kiss", p_ref_date: "2000-01-01" }).then(() => {});
      }
      else { setDays((prev) => mergeDays(prev, nd, me)); setGoals((prev) => ({ ...ng, [me]: prev[me] })); }
      setLastSeen(ls);
      const [{ data: mrows }, { data: crows }, { data: rrows }, { data: msgs }, { data: ans }, { data: inv }] = await Promise.all([
        supabase.rpc("gs2_mileage_get", { p_code: code }),
        supabase.rpc("gs2_catalog_get", { p_code: code }),
        supabase.rpc("gs2_redeem_get", { p_code: code }),
        supabase.rpc("gs2_msg_get", { p_code: code, p_me: me }),
        supabase.rpc("gs2_qa_get", { p_code: code, p_me: me }),
        supabase.rpc("gs2_inventory_get", { p_code: code }),
      ]);
      if (!alive) return;
      if (mrows) setLedger(mrows);
      if (crows) setCatalog(crows);
      if (rrows) setRedeems(rrows);
      if (msgs) setMessages(msgs);
      if (ans) setAnswers(ans);
      if (inv) setInventory(inv);
    };
    setLoading(true); load(true);
    const iv = setInterval(() => load(false), 10000);
    return () => { alive = false; clearInterval(iv); };
  }, [code, me]);

  // 마일리지 자동 적립 체크 (내 기록 기준, 중복 적립은 DB에서 방지)
  useEffect(() => {
    if (!code || loading || !me) return;
    // 보고 있는 날짜(date) 기준으로 지급 — 과거 날짜를 소급 기록해도 그 날짜로 포인트 지급됨
    const en = days[date]?.[me];
    const kissAward = (delta, reason, rd) => supabase.rpc("gs2_kiss_award", { p_code: code, p_slot: me, p_delta: delta, p_reason: reason, p_ref_date: rd }).then(() => supabase.rpc("gs2_mileage_get", { p_code: code }).then(({ data }) => { if (data) setLedger(data); }));
    if (isCompleteEntry(me, en)) { award(me, POINTS.full, "daily", date); kissAward(POINTS.full, "daily", date); if (date === today()) supabase.rpc("gs2_notify_activity", { p_code: code, p_slot: me, p_kind: "daily", p_ref_date: date }).then(() => {}); }
    else if (hasEntry(en)) { award(me, POINTS.partial, "daily", date); kissAward(POINTS.partial, "daily", date); }

    if (new Date().getDay() === 0) {
      const wk = weekDates(today());
      const m = metricsFor(me, wk);
      if (regLabel(m.spread).dots === 5) award(me, POINTS.weekly, "weekly_sleepreg", weekMonday(today()));
      if (m.exDays >= (goals[me]?.exerciseWeekly || 4)) award(me, POINTS.weekly, "weekly_exercise", weekMonday(today()));
    }
    const tmr = addDays(today(), 1);
    if (tmr.slice(0, 7) !== today().slice(0, 7)) {
      const mf = monthFirst(today());
      const mm = monthMetrics(me, Number(today().slice(0, 4)), Number(today().slice(5, 7)));
      const daysElapsed = Number(today().slice(8, 10));
      const rate = daysElapsed > 0 ? mm.logged / daysElapsed : 0;
      const weeks = new Set(); let c = monthFirst(today());
      while (c.slice(0, 7) === today().slice(0, 7)) { weeks.add(weekMonday(c)); c = addDays(c, 1); }
      const allWeeksMet = [...weeks].every((wm) => ledger.some((r) => r.slot === me && r.reason === "weekly_sleepreg" && r.ref_date === wm) && ledger.some((r) => r.slot === me && r.reason === "weekly_exercise" && r.ref_date === wm));
      if (rate >= 0.9 && allWeeksMet) award(me, POINTS.monthly, "monthly_bonus", mf);
    }
    const streak = streakFor(me);
    const SENTINEL = "2000-01-01";
    if (streak >= 30) award(me, POINTS.m30, "milestone_30", SENTINEL);
    if (streak >= 100) award(me, POINTS.m100, "milestone_100", SENTINEL);
    if (streak >= 365) award(me, POINTS.m365, "milestone_365", SENTINEL);
  }, [code, loading, days, me, date]);

  // 날짜/사람 변경 시: 이미 채워진 항목은 접힌 상태로 시작
  useEffect(() => {
    const en = (days[date] && days[date][page]) || blankEntry();
    setOpenSet({});
    setInitFilled({
      ex: !!en.exercise,
      snack: en.snack >= 0,
      mood: (en.mood || 0) > 0,
      meals: !!(en.meals && (en.meals.breakfast || en.meals.lunch || en.meals.dinner)),
      grat: (en.gratitude || []).some((x) => (x || "").trim()),
      refl: !!(en.reflection || "").trim(),
    });
  }, [date, page, loading]);

  // 랜드마크 축하 (마일스톤/월간개근) — 기기당 1회, 풀스크린
  useEffect(() => {
    if (!code || !me || !ledger.length) return;
    const LM = { milestone_30: ["30일 연속 기록! 🔥", "한 달을 함께 해냈어요"], milestone_100: ["100일 연속 기록! 🌟", "백 일의 꾸준함, 대단해요"], milestone_365: ["365일 연속 기록! 👑", "1년을 함께 했어요"], monthly_bonus: ["월간 개근 달성! 🏅", "이번 달, 거의 완벽했어요"] };
    for (const r of ledger) {
      if (r.slot !== me) continue;
      const lm = LM[r.reason]; if (!lm) continue;
      const k = `gs-celebrated:${r.reason}:${r.ref_date}`;
      try {
        if (!localStorage.getItem(k)) {
          localStorage.setItem(k, "1");
          setBigCeleb({ key: Date.now(), title: lm[0], sub: lm[1] });
          try { navigator.vibrate && navigator.vibrate([80, 40, 120]); } catch (e2) {}
          break;
        }
      } catch (e1) {}
    }
  }, [ledger, code, me]);

  // 오늘 기록 완성 — 하루 1회 소소한 축하
  useEffect(() => {
    if (!code || loading) return;
    const en = days[today()]?.[me];
    if (!isCompleteEntry(me, en)) return;
    const k = `gs-daydone:${today()}`;
    try { if (localStorage.getItem(k)) return; localStorage.setItem(k, "1"); } catch (e1) { return; }
    fireCelebrate("오늘 기록 완성! ✨");
  }, [days, code, loading, me]);

  const login = () => { const c = codeInput.trim().toLowerCase(); if (!c) return; try { localStorage.setItem(LS_CODE, c); localStorage.setItem(LS_ME, meInput); } catch (e) {} setCode(c); setMe(meInput); setPage(meInput); };
  const logout = () => { try { localStorage.removeItem(LS_CODE); localStorage.removeItem(LS_ME); } catch (e) {} setCode(null); setDays({}); setCodeInput(""); };

  const getEntry = (slot) => (days[date] && days[date][slot]) || blankEntry();
  const [saveFailed, setSaveFailed] = useState(false);

  // ---- 🎂 생일 서프라이즈 (지인 8/1) ----
  const BDAY = { slot: "b", date: "2026-08-01", name: "지인" };
  const isBday = me === BDAY.slot && today() === BDAY.date;
  const [bdayOpen, setBdayOpen] = useState(false);
  const [bdayGiftDone, setBdayGiftDone] = useState(false);
  useEffect(() => {
    if (!isBday || !code) return;
    try { if (localStorage.getItem("gs_bday_" + BDAY.date) === "1") return; } catch (e) {}
    setBdayOpen(true);
  }, [isBday, code]);
  const claimBdayGift = () => {
    supabase.rpc("gs2_kiss_award", { p_code: code, p_slot: me, p_delta: 100, p_reason: "birthday", p_ref_date: BDAY.date }).then(() => {
      supabase.rpc("gs2_mileage_get", { p_code: code }).then(({ data }) => { if (data) setLedger(data); });
      setBdayGiftDone(true); fireCelebrate("생일 선물 도착! 💋+100");
    });
  };
  const closeBday = () => { setBdayOpen(false); try { localStorage.setItem("gs_bday_" + BDAY.date, "1"); } catch (e) {} };
  const pushData = (slot, entry) => {
    const k = `${date}:${slot}`;
    if (saveTimers.current[k]) clearTimeout(saveTimers.current[k]);
    saveTimers.current[k] = setTimeout(() => {
      supabase.rpc("gs2_save_data", { p_code: code, p_date: date, p_slot: slot, p_data: dataForDb(entry) }).then(({ error }) => {
        if (error) setSaveFailed(true);
        else setSaveFailed(false);
      }).catch(() => setSaveFailed(true));
    }, 600);
  };
  const updateEntry = (slot, patch) => { if (slot !== me) return; setDays((prev) => { const day = { ...(prev[date] || {}) }; const entry = { ...(day[slot] || blankEntry()), ...patch }; day[slot] = entry; pushData(slot, entry); return { ...prev, [date]: day }; }); };
  const award = (slot, delta, reason, refDate) => {
    supabase.rpc("gs2_mileage_award", { p_code: code, p_slot: slot, p_delta: delta, p_reason: reason, p_ref_date: refDate }).then(() => {
      supabase.rpc("gs2_mileage_get", { p_code: code }).then(({ data }) => { if (data) setLedger(data); });
    });
  };
  const trackMealsFor = (slot) => { const gg = goals[slot] || {}; return gg.trackMeals !== undefined ? !!gg.trackMeals : slot === "b"; };
  const isCompleteEntry = (slot, en) => {
    if (!en) return false;
    const base = en.bed && en.wake && en.snack >= 0 && (en.mood || 0) > 0 && (en.gratitude || []).some((x) => (x || "").trim()) && (en.reflection || "").trim();
    if (!base) return false;
    if (trackMealsFor(slot)) return !!(en.meals && (en.meals.breakfast || en.meals.lunch || en.meals.dinner));
    return true;
  };
  const flushSave = (slot) => { const k = `${date}:${slot}`; if (saveTimers.current[k]) { clearTimeout(saveTimers.current[k]); delete saveTimers.current[k]; } const entry = getEntry(slot); supabase.rpc("gs2_save_data", { p_code: code, p_date: date, p_slot: slot, p_data: dataForDb(entry) }).then(() => { setSavedFlash({ slot, ts: Date.now() }); setTimeout(() => setSavedFlash((f) => (f && f.slot === slot ? null : f)), 1800); }); };
  const updateMeal = (slot, key, val) => { const e = getEntry(slot); updateEntry(slot, { meals: { ...e.meals, [key]: val } }); };
  const autoGrow = (ev) => { const el = ev.target; el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; };
  const autoGrowRef = (el) => { if (el && !el.dataset.grown) { el.dataset.grown = "1"; requestAnimationFrame(() => { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }); } };
  const sendCheer = (slot) => { setBurstKey((k) => k + 1); setDays((prev) => { const day = { ...(prev[date] || {}) }; const entry = { ...(day[slot] || blankEntry()) }; entry.cheers = (entry.cheers || 0) + 1; day[slot] = entry; supabase.rpc("gs2_save_cheers", { p_code: code, p_date: date, p_slot: slot, p_cheers: entry.cheers }).then(() => {}); return { ...prev, [date]: day }; }); };
  const saveGoal = (slot, patch) => { if (slot !== me) return; setGoals((prev) => { const g = { ...prev[slot], ...patch }; const next = { ...prev, [slot]: g }; supabase.rpc("gs2_save_goal", { p_code: code, p_slot: slot, p_data: g }).then(() => {}); if (patch.bedtime && pushState === "on") supabase.rpc("gs2_update_bedtime", { p_code: code, p_slot: me, p_bedtime: patch.bedtime }).then(() => {}); return next; }); };
  const fireCelebrate = (msg) => { setCelebrate({ key: Date.now(), msg }); setTimeout(() => setCelebrate(null), 2200); };
  const reloadSocial = () => {
    supabase.rpc("gs2_msg_get", { p_code: code, p_me: me }).then(({ data }) => { if (data) setMessages(data); });
    supabase.rpc("gs2_qa_get", { p_code: code, p_me: me }).then(({ data }) => { if (data) setAnswers(data); });
  };
  const sendCheerMsg = (slot, text) => {
    setBurstKey((k) => k + 1);
    supabase.rpc("gs2_save_cheers", { p_code: code, p_date: date, p_slot: slot, p_cheers: (getEntry(slot).cheers || 0) + 1 }).then(() => {});
    setDays((prev) => { const day = { ...(prev[date] || {}) }; const en = { ...(day[slot] || blankEntry()) }; en.cheers = (en.cheers || 0) + 1; day[slot] = en; return { ...prev, [date]: day }; });
    if (text && text.trim()) supabase.rpc("gs2_msg_send", { p_code: code, p_from: me, p_to: slot, p_kind: "cheer", p_message: text.trim(), p_deliver: null }).then(reloadSocial);
    setShowCheerBox(false); setCheerText("");
  };
  const saveAnswer = () => {
    if (!qInput.trim()) return;
    supabase.rpc("gs2_qa_save", { p_code: code, p_slot: me, p_qdate: today(), p_answer: qInput.trim() }).then(() => { setQInput(""); reloadSocial(); fireCelebrate("답변 완료! 💕"); supabase.rpc("gs2_notify_activity", { p_code: code, p_slot: me, p_kind: "qa", p_ref_date: today() }).then(() => {}); });
  };
  const sendLetter = () => {
    if (!letterInput.msg.trim() || !letterInput.date) { setRedeemMsg("쪽지 내용과 배달 날짜를 정해줘요."); return; }
    supabase.rpc("gs2_msg_send", { p_code: code, p_from: me, p_to: (me === "a" ? "b" : "a"), p_kind: "letter", p_message: letterInput.msg.trim(), p_deliver: letterInput.date }).then(() => { setLetterInput({ msg: "", date: "" }); reloadSocial(); fireCelebrate("쪽지를 숨겨뒀어요 💌"); });
  };
  const openMessage = (m) => { supabase.rpc("gs2_msg_open", { p_code: code, p_id: m.id }).then(reloadSocial); setOpenLetter(m); };
  const sendGift = () => {
    const amt = parseInt(giftInput, 10);
    if (!amt || amt <= 0) { setRedeemMsg("선물할 포인트를 입력해줘요."); return; }
    supabase.rpc("gs2_mileage_gift", { p_code: code, p_from: me, p_to: (me === "a" ? "b" : "a"), p_amount: amt }).then(({ data: ok }) => {
      if (ok) { setGiftInput(""); setBigCeleb({ key: Date.now(), title: `${amt}p 선물 완료! 💝`, sub: `${names[me === "a" ? "b" : "a"]}에게 마음을 보냈어요` }); supabase.rpc("gs2_mileage_get", { p_code: code }).then(({ data }) => { if (data) setLedger(data); }); reloadSocial(); }
      else setRedeemMsg("포인트가 부족해요 🥲");
    });
  };
  const saveAvatar = (patch) => saveGoal(me, { avatar: { ...(goals[me] && goals[me].avatar), ...patch } });
  const styleTarget = page; // 스타일 탭은 상단 a/b 탭을 따름
  const styleMine = page === me;
  const reloadShopData = () => {
    supabase.rpc("gs2_inventory_get", { p_code: code }).then(({ data }) => { if (data) setInventory(data); });
    supabase.rpc("gs2_mileage_get", { p_code: code }).then(({ data }) => { if (data) setLedger(data); });
  };
  const buyItem = (it) => {
    supabase.rpc("gs2_item_buy_kiss", { p_code: code, p_slot: me, p_item: it.id }).then(({ data: ok }) => {
      if (ok) { reloadShopData(); setTryOn({}); saveAvatar({ [it.cat]: it.id }); setUnbox({ item: it }); }
      else setRedeemMsg("뽀뽀가 부족하거나 이미 보유 중이에요 🥲");
    });
  };
  const sendItemGift = () => {
    const it = giftItem; if (!it) return;
    const pto = me === "a" ? "b" : "a";
    supabase.rpc("gs2_item_gift_kiss", { p_code: code, p_from: me, p_to: pto, p_item: it.id, p_title: `${it.icon} ${it.name}`, p_note: giftNote.trim() || null }).then(({ data: ok }) => {
      if (ok) { setGiftItem(null); setGiftNote(""); reloadShopData(); setBigCeleb({ key: Date.now(), title: "선물 완료! 💝", sub: `${names[pto]}에게 ${it.name}을(를) 보냈어요` }); }
      else setRedeemMsg("뽀뽀가 부족하거나 상대가 이미 보유 중이에요 🥲");
    });
  };
  const GACHA_COST = 20, GACHA_COST10 = 180;
  const gachaPool = ITEMS.map((it) => ({ id: it.id, tier: it.tier, price: it.price }));
  const doGacha = (count) => {
    if (gachaRolling) return;
    const cost = count === 10 ? GACHA_COST10 : GACHA_COST;
    if (myKiss < cost) { setRedeemMsg("뽀뽀가 부족해요 🥲"); return; }
    setGachaRolling(true); setGachaResult(null);
    const results = [];
    const run = async () => {
      for (let i = 0; i < count; i++) {
        const guarantee = (count === 10 && i === 9) ? 3 : null; // 10연차 마지막은 에픽↑ 보장
        const { data } = await supabase.rpc("gs2_gacha", { p_code: code, p_slot: me, p_cost: cost / count, p_guarantee: guarantee, p_kiss: true });
        if (data && data.ok) results.push(data); else { break; }
      }
      const [{ data: inv }, { data: mrows }] = await Promise.all([
        supabase.rpc("gs2_inventory_get", { p_code: code }),
        supabase.rpc("gs2_mileage_get", { p_code: code }),
      ]);
      if (inv) setInventory(inv); if (mrows) setLedger(mrows);
      setGachaRolling(false);
      setGachaResult(results.map((r) => ({ ...r, item: r.item ? ITEMS_BY_ID[r.item] : null })));
      try { navigator.vibrate && navigator.vibrate([50, 30, 80]); } catch (e) {}
    };
    run();
  };

  const addReward = () => {
    const title = newReward.title.trim(); const cost = parseInt(newReward.cost, 10);
    if (!title || !cost || cost <= 0) { setRedeemMsg("이름과 가격을 입력해줘요."); return; }
    supabase.rpc("gs2_catalog_add", { p_code: code, p_slot: me, p_title: title, p_emoji: newReward.emoji || "🎁", p_cost: cost }).then(() => {
      supabase.rpc("gs2_catalog_get", { p_code: code }).then(({ data }) => { if (data) setCatalog(data); });
      setNewReward({ emoji: "🎁", title: "", cost: "" });
    });
  };
  const seedDefaults = async () => {
    for (const r of DEFAULT_REWARDS) {
      await supabase.rpc("gs2_catalog_add", { p_code: code, p_slot: me, p_title: r.title, p_emoji: r.emoji, p_cost: r.cost });
    }
    const { data } = await supabase.rpc("gs2_catalog_get", { p_code: code });
    if (data) setCatalog(data);
    fireCelebrate("💝 추천 리워드가 담겼어요!");
  };
  const deleteReward = (id) => {
    supabase.rpc("gs2_catalog_delete", { p_code: code, p_id: id }).then(() => {
      supabase.rpc("gs2_catalog_get", { p_code: code }).then(({ data }) => { if (data) setCatalog(data); });
    });
  };
  const doRedeem = (item) => {
    supabase.rpc("gs2_redeem", { p_code: code, p_slot: me, p_catalog_id: item.id }).then(({ data: ok }) => {
      if (ok) {
        const isFirst = redeems.filter((r) => r.requester === me).length === 0;
        if (isFirst) { setBigCeleb({ key: Date.now(), title: "첫 리워드 교환! 🎁", sub: `${item.title} — 곧 만나요` }); try { navigator.vibrate && navigator.vibrate([80, 40, 120]); } catch (e2) {} }
        else fireCelebrate(`${item.emoji} ${item.title} 교환 완료!`);
        Promise.all([supabase.rpc("gs2_mileage_get", { p_code: code }), supabase.rpc("gs2_redeem_get", { p_code: code })]).then(([m, r]) => { if (m.data) setLedger(m.data); if (r.data) setRedeems(r.data); });
      } else setRedeemMsg("마일리지가 부족해요 🥲");
    });
  };
  const confirmRedeem = (id) => {
    supabase.rpc("gs2_redeem_confirm", { p_code: code, p_id: id }).then(() => {
      supabase.rpc("gs2_redeem_get", { p_code: code }).then(({ data }) => { if (data) setRedeems(data); });
    });
  };

  const togglePush = async () => {
    setPushMsg("");
    if (pushState === "unsupported") { setPushMsg("아이폰은 먼저 '홈 화면에 추가'로 앱을 설치한 뒤에 알림을 켤 수 있어요 🙏"); return; }
    if (pushState === "denied") { setPushMsg("브라우저/기기 설정에서 이 사이트의 알림 권한을 허용으로 바꿔주세요."); return; }
    if (pushState === "on") {
      setPushState("busy");
      try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); await supabase.rpc("gs2_delete_sub", { p_code: code, p_slot: me }); } catch (e) {}
      setPushState("off"); setPushMsg("알림을 껐어요.");
      return;
    }
    // turn on
    setPushState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setPushState(perm === "denied" ? "denied" : "off"); setPushMsg("알림 권한이 필요해요."); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC) });
      const j = sub.toJSON();
      const tz = -new Date().getTimezoneOffset();
      await supabase.rpc("gs2_save_sub", { p_code: code, p_slot: me, p_endpoint: sub.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_bedtime: (goals[me] && goals[me].bedtime) || "23:30", p_tz: tz });
      setPushState("on"); setPushMsg("알림을 켰어요! 🔔");
    } catch (e) { setPushState("off"); setPushMsg("알림 설정에 실패했어요. 잠시 후 다시 시도해줘요."); }
  };

  const hasEntry = (e) => !!e && (e.bed || e.wake || e.exercise || e.exNote || e.snack >= 0 || e.snackNote || e.mood > 0 || (e.meals && (e.meals.breakfast || e.meals.lunch || e.meals.dinner)) || e.gratitude?.some((g) => g.trim()) || e.reflection?.trim());
  const streakFor = (slot) => { let n = 0, cur = today(); for (let i = 0; i < 400; i++) { const d = days[cur]; if (d && hasEntry(d[slot])) { n++; cur = addDays(cur, -1); } else break; } return n; };

  const weekDates = (ref) => { const [y, m, d] = ref.split("-").map(Number); const dt = new Date(y, m - 1, d); const dow = (dt.getDay() + 6) % 7; const mon = new Date(y, m - 1, d - dow); return [...Array(7)].map((_, i) => ymd(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i))); };
  const metricsFor = (slot, weekArr) => {
    let durs = [], beds = [], exDays = 0, logged = 0, pgSum = 0, pgDays = 0;
    weekArr.forEach((dk) => { if (dk > today()) return; const e = days[dk]?.[slot]; if (!e) return; if (hasEntry(e)) logged++; const mm = sleepMinutes(e.bed, e.wake); if (mm) { durs.push(mm); beds.push(bedMin(e.bed)); } if (e.exercise) exDays++; const pgv = Number(e.pg) || 0; if (pgv > 0) { pgSum += pgv; pgDays++; } });
    const avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
    const spread = beds.length >= 2 ? Math.max(...beds) - Math.min(...beds) : null;
    return { durs, beds, exDays, logged, avg, spread, nSleep: durs.length, pgSum, pgDays };
  };
  // 개인 목표: { label, emoji, unit, weeklyLimit, countLimit(0=제한없음) }
  const pgoalOf = (slot) => (goals[slot] && goals[slot].pgoal) || null;
  // 보너스 규칙: 조건 달성 시 주간 한도 증가. [{id,label,emoji,type:'daily_check'|'sleep_hours',hours?,minDays,reward}]
  const bonusRulesOf = (slot) => (goals[slot] && goals[slot].bonusRules) || [];
  const bonusEval = (slot, weekArr) => {
    return bonusRulesOf(slot).map((r) => {
      let d = 0;
      weekArr.forEach((dk) => { if (dk > today()) return; const e = days[dk]?.[slot]; if (!e) return;
        if (r.type === "daily_check") { if (e.bonus && e.bonus[r.id]) d++; }
        else if (r.type === "sleep_hours") { const mm = sleepMinutes(e.bed, e.wake); if (mm != null && mm >= (r.hours || 7) * 60) d++; }
        else if (r.type === "exercise") { if (e.exercise) d++; }
      });
      return { ...r, days: d, met: d >= r.minDays };
    });
  };
  const pgStatus = (pg, m, effLimit) => {
    if (!pg) return null;
    const lim = effLimit || pg.weeklyLimit;
    const overAmt = m.pgSum > lim;
    const overCnt = pg.countLimit > 0 && m.pgDays > pg.countLimit;
    const nearAmt = !overAmt && m.pgSum > lim * 0.8;
    if (overAmt || overCnt) return { txt: "한도 초과", c: "#DC6B57" };
    if (nearAmt) return { txt: "한도 임박", c: "#E0A23B" };
    return { txt: "순항 중", c: "#3DAE7B" };
  };
  const fmtPg = (pg, v) => pg.unit === "분" ? (v >= 60 ? `${Math.floor(v / 60)}시간${v % 60 ? " " + (v % 60) + "분" : ""}` : `${v}분`) : `${v}${pg.unit}`;
  const regLabel = (spread) => { if (spread == null) return { txt: "기록 부족", dots: 0, c: "#B0A59C" }; if (spread <= 60) return { txt: "아주 규칙적", dots: 5, c: "#3DAE7B" }; if (spread <= 90) return { txt: "규칙적", dots: 4, c: "#6FB98F" }; if (spread <= 120) return { txt: "보통", dots: 3, c: "#E0A23B" }; if (spread <= 180) return { txt: "조금 들쭉날쭉", dots: 2, c: "#E08A3B" }; return { txt: "들쭉날쭉", dots: 1, c: "#DC6B57" }; };
  const makeFeedback = (cur, prev, goal) => {
    const good = [], tip = [];
    if (cur.spread != null) { if (cur.spread <= 60) good.push("취침 시간이 아주 일정했어요 👍"); else tip.push("취침 시간을 1시간 이내로 모아보기"); }
    if (cur.avg != null) { const gm = goal.sleepHours * 60; if (cur.avg >= gm - 30) good.push(`평균 ${fmtSleep(cur.avg)} 잘 잤어요`); else tip.push(`30분 더 자보기 (목표 ${goal.sleepHours}시간)`); }
    if (cur.exDays >= goal.exerciseWeekly) good.push(`운동 목표 달성! (${cur.exDays}회)`); else if (cur.exDays > 0) tip.push(`운동 ${goal.exerciseWeekly - cur.exDays}회 더 채우기`); else tip.push("이번 주 운동 시작해보기");
    let trend = "";
    if (prev.avg != null && cur.avg != null) { if (cur.avg > prev.avg + 15) trend = "지난주보다 더 잤어요 ↑"; else if (cur.avg < prev.avg - 15) trend = "지난주보다 덜 잤어요 ↓"; else trend = "지난주와 비슷해요 →"; }
    return { good, tip, trend, empty: cur.nSleep === 0 && cur.exDays === 0 && cur.logged === 0 };
  };

  // 3번: 최근 14일 수면 빚 (부족은 쌓이고, 더 잔 날은 갚아짐)
  const sleepDebtFor = (slot, goal) => {
    let net = 0, n = 0;
    for (let i = 0; i < 14; i++) {
      const e2 = days[addDays(today(), -i)]?.[slot];
      const m = e2 ? sleepMinutes(e2.bed, e2.wake) : null;
      if (m != null) { n++; net += goal.sleepHours * 60 - m; }
    }
    return { debt: Math.max(0, Math.round(net)), n };
  };
  // 5번: 수면 <-> 기분 상관 인사이트 (최근 14일)
  const moodInsightFor = (slot, goal) => {
    const good = [], bad = [];
    for (let i = 0; i < 14; i++) {
      const e2 = days[addDays(today(), -i)]?.[slot];
      if (!e2 || !e2.mood) continue;
      const m = sleepMinutes(e2.bed, e2.wake);
      if (m == null) continue;
      (m >= goal.sleepHours * 60 - 30 ? good : bad).push(e2.mood);
    }
    if (good.length >= 2 && bad.length >= 2) {
      const avg = (x) => x.reduce((s, v) => s + v, 0) / x.length;
      const ga = avg(good), ba = avg(bad);
      if (ga - ba >= 0.4) return `잘 잔 날 기분이 더 좋았어요 (${ga.toFixed(1)} vs ${ba.toFixed(1)}) 🙂`;
    }
    return null;
  };
  // 4번: 이번 주 우리 둘 공동 지표
  const coupleWeek = (weekArr) => {
    let cheersTotal = 0, bothDays = 0;
    weekArr.forEach((dk) => { if (dk > today()) return; const d = days[dk] || {}; cheersTotal += (d.a?.cheers || 0) + (d.b?.cheers || 0); if (hasEntry(d.a) && hasEntry(d.b)) bothDays++; });
    return { cheersTotal, bothDays };
  };
  // 아침 문구: 오늘 상황(운동일/전날 수면/요일)에 맞춰 카테고리 결정
  const quoteCategory = (slot) => {
    const gg = goals[slot] || defaultGoal();
    const dowMon = (new Date().getDay() + 6) % 7; // 0=월 ... 6=일
    if ((gg.exerciseDays || []).includes(dowMon)) return "exercise";
    const y = days[addDays(today(), -1)]?.[slot];
    const m = y ? sleepMinutes(y.bed, y.wake) : null;
    if (m != null) {
      if (m < gg.sleepHours * 60 - 30) return "tired";
      if (m >= gg.sleepHours * 60 - 15) return "rested";
    }
    if (dowMon === 0) return "monday";
    if (dowMon >= 5) return "weekend";
    return "general";
  };
  // 월간 리포트: 특정 연/월의 지표 (durs, exDays, spread 등)
  const monthMetrics = (slot, year, month) => {
    const dim = new Date(year, month, 0).getDate();
    let durs = [], beds = [], exDays = 0, logged = 0;
    for (let d = 1; d <= dim; d++) {
      const dk = `${year}-${pad(month)}-${pad(d)}`;
      if (dk > today()) break;
      const e2 = days[dk]?.[slot]; if (!e2) continue;
      if (hasEntry(e2)) logged++;
      const mm = sleepMinutes(e2.bed, e2.wake);
      if (mm) { durs.push(mm); beds.push(bedMin(e2.bed)); }
      if (e2.exercise) exDays++;
    }
    const avg = durs.length ? Math.round(durs.reduce((a,b)=>a+b,0)/durs.length) : null;
    const spread = beds.length >= 2 ? Math.max(...beds) - Math.min(...beds) : null;
    return { avg, exDays, logged, spread, nSleep: durs.length };
  };

  const themeOf = (slot) => {
    const gg = goals[slot] || {};
    const pal = PALETTES[gg.palette] || PALETTES[slot === "a" ? "coral" : "fairy"];
    const ch = CHARACTERS[gg.charId] || CHARACTERS[slot === "a" ? "fire" : "seal"];
    return { ...THEME[slot], ...pal, emoji: ch.emoji };
  };
  const T = { a: themeOf("a"), b: themeOf("b") };
  const charOf = (slot) => (goals[slot] && goals[slot].charId) || (slot === "a" ? "fire" : "seal");
  const wrapStyle = ready ? themeVars(T[page || "a"], night) : themeVars(THEME.a, false);

  if (!ready || !authChecked) return <div className="td-wrap" style={themeVars(THEME.a, false)}><style>{css}</style><div className="td-loading">불러오는 중…</div></div>;

  const installBanner = showInstall ? (
    <div className="td-install">
      {iosGuide ? (
        <span className="td-installtxt">📲 홈 화면에 추가하려면: 하단 <b>공유</b> → <b>홈 화면에 추가</b></span>
      ) : (
        <span className="td-installtxt">📲 앱처럼 홈 화면에 추가할까요?</span>
      )}
      <div className="td-installbtns">
        {!iosGuide && <button className="td-installadd" onClick={doInstall}>추가</button>}
        <button className="td-installx" onClick={dismissInstall}>✕</button>
      </div>
    </div>
  ) : null;

  if (!session) {
    // 앱 시작: 로그인 화면 (계정 필수, 레거시 코드 로그인은 접이식 임시 제공)
    return (
      <div className={"td-wrap" + (night ? " night" : "")} style={wrapStyle}>
        <style>{css}</style>
        {installBanner}
        <div className="td-login">
          <div className="td-loginbuddy td-breathe"><FireBuddy mood="happy" /></div>
          <h1>우리의 하루</h1>
          <p>{authMode === "signup" ? "계정을 만들고 둘만의 기록을 시작해요." : "로그인하고 우리의 기록을 이어가요."}</p>
          <input className="td-input" type="email" placeholder="이메일" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
          <input className="td-input" type="password" placeholder="비밀번호" value={pwInput} onChange={(e) => setPwInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && authMode === "signin" && emailAuth()} style={{ marginTop: 8 }} />
          {authMode === "signup" && <input className="td-input" type="password" placeholder="비밀번호 확인" value={pw2Input} onChange={(e) => setPw2Input(e.target.value)} onKeyDown={(e) => e.key === "Enter" && emailAuth()} style={{ marginTop: 8 }} />}
          <button className="td-loginbtn" onClick={emailAuth} disabled={authBusy}>{authBusy ? "잠시만요…" : authMode === "signup" ? "계정 만들기" : "로그인"}</button>
          {authMsg && <small className="td-loginhint" style={{ color: authMsg.includes("보냈어요") ? "var(--c1)" : "#e55" }}>{authMsg}</small>}
          <small className="td-loginhint" onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthMsg(""); }} style={{ cursor: "pointer", textDecoration: "underline" }}>
            {authMode === "signin" ? "처음이에요? 계정 만들기" : "이미 계정이 있어요? 로그인"}
          </small>
          <div className="td-loginor"><span>또는</span></div>
          <button className="td-googlebtn" onClick={loginWithGoogle}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>
            Google로 계속하기
          </button>
          <small className="td-loginhint" onClick={() => setShowLegacy(!showLegacy)} style={{ cursor: "pointer", textDecoration: "underline" }}>예전 공유 코드로 접속 (임시)</small>
          {showLegacy && (<div style={{ marginTop: 8 }}>
            <input className="td-input" placeholder="공유 코드" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
            <div className="td-whopick">
              <span>나는</span>
              {["a", "b"].map((p) => (<button key={p} className={"td-whobtn" + (meInput === p ? " on" : "")} onClick={() => setMeInput(p)} style={{ "--tc": THEME[p].c1 }}>{THEME[p].emoji} {THEME[p].name}</button>))}
            </div>
            <button className="td-loginbtn" onClick={login}>코드로 시작하기</button>
            <small className="td-loginhint">코드 접속은 곧 종료돼요. 계정을 만들어 연결해주세요!</small>
          </div>)}
        </div>
      </div>
    );
  }

  if (pendingInvite) {
    return (
      <div className={"td-wrap" + (night ? " night" : "")} style={wrapStyle}>
        <style>{css}</style>
        <div className="td-login">
          <div className="td-loginbuddy td-breathe"><FireBuddy mood="happy" /></div>
          <h1>커플이 만들어졌어요!</h1>
          <p>아래 버튼으로 연인에게 초대 링크를 보내주세요. 링크를 열면 자동으로 연결돼요.</p>
          <button className="td-loginbtn" onClick={() => shareInvite(pendingInvite.code)}>💌 초대 링크 공유하기</button>
          <small className="td-loginhint">공유 코드: {pendingInvite.code}</small>
          {linkMsg && <small className="td-loginhint" style={{ color: "var(--c1)" }}>{linkMsg}</small>}
          <div className="td-loginor"><span>또는</span></div>
          <button className="td-googlebtn" onClick={enterApp}>일단 시작하기</button>
        </div>
      </div>
    );
  }

  if (!code) {
    // 로그인은 됐는데 아직 커플에 연결 안 된 상태: 기존 코드 연결 or 새 커플 만들기
    return (
      <div className={"td-wrap" + (night ? " night" : "")} style={wrapStyle}>
        <style>{css}</style>
        <div className="td-login">
          <div className="td-loginbuddy td-breathe"><FireBuddy mood="happy" /></div>
          <h1>거의 다 왔어요</h1>
          <p>{session.user.email}로 로그인했어요.{inviteCode ? " 초대받은 코드로 자동 입력해뒀어요!" : ""}</p>
          <div className="td-whopick">
            <span>나는</span>
            {["a", "b"].map((p) => (<button key={p} className={"td-whobtn" + (linkSlotInput === p ? " on" : "")} onClick={() => setLinkSlotInput(p)} style={{ "--tc": THEME[p].c1 }}>{THEME[p].emoji} {THEME[p].name}</button>))}
          </div>
          <input className="td-input" placeholder="공유 코드가 있다면 입력" value={linkCodeInput} onChange={(e) => setLinkCodeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && linkCouple()} />
          <button className="td-loginbtn" onClick={linkCouple} disabled={linking}>{linking ? "연결 중…" : "코드로 연결하기"}</button>
          {!inviteCode && (<>
            <div className="td-loginor"><span>또는</span></div>
            <button className="td-googlebtn" onClick={createCouple} disabled={linking}>💞 새 커플 만들기 (코드 자동 생성)</button>
          </>)}
          {linkMsg && <small className="td-loginhint" style={{ color: linkMsg.includes("예전에") ? "var(--c1)" : "#e55" }}>{linkMsg}</small>}
          <small className="td-loginhint" onClick={logoutAuth} style={{ cursor: "pointer", textDecoration: "underline" }}>다른 계정으로 로그인</small>
        </div>
      </div>
    );
  }

  const t = T[page]; const g = goals[page]; const e = getEntry(page);
  const names = { a: (goals.a && goals.a.name) || THEME.a.name, b: (goals.b && goals.b.name) || THEME.b.name };
  const qTone = (g && (g.quoteTone === "a" || g.quoteTone === "b")) ? g.quoteTone : page;
  const myCat = quoteCategory(me);
  const myTone = (goals[me] && (goals[me].quoteTone === "a" || goals[me].quoteTone === "b")) ? goals[me].quoteTone : me;
  const myQuote = QUOTES[myTone][myCat][dayOfYear(today()) % QUOTES[myTone][myCat].length];
  const mine = page === me;
  const isMile = (r) => (r.currency || "mile") === "mile";
  const isKiss = (r) => r.currency === "kiss";
  const balA = ledger.filter((r) => r.slot === "a" && isMile(r)).reduce((s, r) => s + r.delta, 0);
  const balB = ledger.filter((r) => r.slot === "b" && isMile(r)).reduce((s, r) => s + r.delta, 0);
  const myBal = me === "a" ? balA : balB;
  const kissA = ledger.filter((r) => r.slot === "a" && isKiss(r)).reduce((s, r) => s + r.delta, 0);
  const kissB = ledger.filter((r) => r.slot === "b" && isKiss(r)).reduce((s, r) => s + r.delta, 0);
  const myKiss = me === "a" ? kissA : kissB;
  const todayQ = qForDate(date);
  const myAns = answers.find((a) => a.qdate === date && a.slot === me);
  const partnerAns = answers.find((a) => a.qdate === date && a.slot !== me);
  const inboxLetters = messages.filter((m) => m.kind === "letter" && m.to_slot === me && !m.opened);
  const recentCheers = messages.filter((m) => m.kind === "cheer" && m.to_slot === me).slice(0, 3);
  const ownedSets = { a: new Set(inventory.filter(iv => iv.slot === "a").map(iv => iv.item_id)), b: new Set(inventory.filter(iv => iv.slot === "b").map(iv => iv.item_id)) };
  const giftInbox = inventory.filter(iv => iv.slot === me && iv.gifted_by && !iv.gift_opened).map(iv => ({ item: ITEMS_BY_ID[iv.item_id], giftedBy: iv.gifted_by, note: iv.gift_note, invId: iv.id })).filter(x => x.item);
  const partner = me === "a" ? "b" : "a";
  const sortedCat = [...catalog].sort((x, y) => x.cost - y.cost);
  const nextGoal = sortedCat.find((c) => c.cost > myBal) || null;
  const affordableCnt = sortedCat.filter((c) => c.cost <= myBal).length;
  const yEntry = days[addDays(date, -1)]?.[page];
  const yb = yEntry && yEntry.bed && yEntry.wake ? yEntry : null;
  const mins = sleepMinutes(e.bed, e.wake); const mood = sleepMood(mins);
  const charge = mins ? Math.min(100, Math.round((mins / (g.sleepHours * 60)) * 100)) : 0;
  const { md, dow } = labelDate(date); const isToday = date === today();
  const thisWeek = weekDates(today()); const lastWeek = weekDates(addDays(today(), -7));
  const cur = metricsFor(page, thisWeek); const prev = metricsFor(page, lastWeek);
  const reg = regLabel(cur.spread); const fb = makeFeedback(cur, prev, g);
  const exPct = Math.min(100, Math.round((cur.exDays / Math.max(1, g.exerciseWeekly)) * 100));
  const sd = sleepDebtFor(page, g);
  const sdColor = sd.debt === 0 ? "#3DAE7B" : sd.debt <= 120 ? "#6FB98F" : sd.debt <= 300 ? "#E0A23B" : "#DC6B57";
  const moodTip = moodInsightFor(page, g);
  const cw = coupleWeek(thisWeek);
  const nowD = new Date();
  const thisMonth = monthMetrics(page, nowD.getFullYear(), nowD.getMonth() + 1);
  const lastMonthD = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
  const lastMonth = monthMetrics(page, lastMonthD.getFullYear(), lastMonthD.getMonth() + 1);
  const monthRegLabel = regLabel(thisMonth.spread);
  const ringItems = [!!(e.bed && e.wake), e.snack >= 0, (e.mood || 0) > 0, (e.gratitude || []).some((x) => (x || "").trim()), !!(e.reflection || "").trim(), ...(trackMealsFor(page) ? [!!(e.meals && (e.meals.breakfast || e.meals.lunch || e.meals.dinner))] : [])];
  const ringDone = ringItems.filter(Boolean).length; const ringTotal = ringItems.length;
  const viewedComplete = isCompleteEntry(page, e);
  const buddyMood = viewedComplete ? "celebrate" : (mins == null ? "curious" : (mood.sleepy ? "sleepy" : "happy"));
  const headline = (() => {
    if (cur.nSleep === 0 && cur.logged === 0) return null;
    if (reg.dots >= 4 && cur.exDays >= g.exerciseWeekly) return "잠도 운동도, 완벽에 가까운 한 주예요 ✨";
    if (reg.dots >= 4) return "꽤 규칙적으로 잠든 한 주였어요 ✨";
    if (prev.avg && cur.avg && cur.avg > prev.avg + 15) return "지난주보다 잠이 좋아지고 있어요 🌱";
    if (cur.exDays >= g.exerciseWeekly) return "운동 목표를 채운 멋진 한 주! 💪";
    if (cur.logged >= 5) return "꾸준히 기록한 한 주였어요 👏";
    return "이번 주도 차곡차곡 쌓는 중이에요 🙂";
  })();
  const streak = streakFor(page);
  const lvl = streak >= 14 ? 3 : streak >= 7 ? 2 : streak >= 3 ? 1 : 0;

  let bedNudge = null;
  if (page === me && isToday && !e.bed && g.bedtime) {
    const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
    const bm = g.bedtime.split(":").map(Number); const target = bm[0] * 60 + bm[1];
    let diff = target - nowMin; if (diff < -720) diff += 1440;
    if (diff >= 0 && diff <= 90) bedNudge = `곧 목표 취침 시간(${g.bedtime})이에요 🌙`;
  }

  const onExercise = () => {
    const willBeOn = !e.exercise;
    updateEntry(page, { exercise: willBeOn });
    if (willBeOn && !e.exercise) {
      const inWeek = thisWeek.includes(date);
      const already = e.exercise;
      const projected = cur.exDays + (inWeek && !already ? 1 : 0);
      if (inWeek && projected === g.exerciseWeekly && cur.exDays < g.exerciseWeekly) fireCelebrate("이번 주 운동 목표 달성! 🎉");
    }
  };

  const [my_, mm_] = monthRef.split("-").map(Number);
  const first = new Date(my_, mm_ - 1, 1); const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(my_, mm_, 0).getDate();
  const monthCells = [];
  for (let i = 0; i < startPad; i++) monthCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) monthCells.push(ymd(new Date(my_, mm_ - 1, d)));

  return (
    <div className={"td-wrap" + (night ? " night" : "")} style={wrapStyle}>
      <style>{css}</style>
      <div className="td-glow" />
      <div className="td-app">

        {bdayOpen && (
          <div className="td-bdayveil">
            <div className="td-bdaycard">
              <div className="td-bdaycake">🎂</div>
              <div className="td-bdayconfetti">🎉 🎈 ✨ 🎊</div>
              <h2>지인아, 생일 축하해</h2>
              <p className="td-bdaymsg">
                나는 표현이 서툴러서<br/>말로는 반의 반도 못 전하지만,<br/>
                내 마음이 작아서 그런 건 절대 아니야.<br/>
                네가 생각하는 것보다 훨씬 크고 깊어.<br/><br/>
                올해 소원은 딱 하나 —<br/>허리도 마음도 아프지 않기.<br/>
                푹 자고, 건강하게. 옆에서 내가 챙길게.<br/><br/>
                태어나줘서 고마워. 사랑해 💛
              </p>
              {!bdayGiftDone
                ? <button className="td-loginbtn" onClick={claimBdayGift}>🎁 생일 선물 받기</button>
                : <div className="td-bdaydone">💋 +100 도착! 스타일샵에서 마음껏 써 🎀</div>}
              <small className="td-loginhint" onClick={closeBday} style={{ cursor: "pointer", textDecoration: "underline" }}>이따가 볼게</small>
            </div>
          </div>
        )}
        {saveFailed && <div className="td-savefail" onClick={() => { setSaveFailed(false); const en = (days[date] || {})[me]; if (en) pushData(me, en); }}>⚠️ 저장이 안 됐어요 — 여기를 눌러 다시 시도</div>}
        <div className="td-topbar">
          <span className="td-hello">{greeting()}, {names[me]} {night ? "🌙" : "☀️"}<small>{new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })} · 오늘</small></span>
          <div className="td-topbtns">
            <span className="td-milebadge" onClick={() => setView(view === "style" ? "style" : "reward")}>{view === "style" ? <>💋 <CountUp value={myKiss} /></> : <>🪙 <CountUp value={myBal} /></>}</span>
            <button className="td-nightbtn" onClick={togglePush} aria-label="알림">{pushState === "on" ? "🔔" : "🔕"}</button>
            <button className="td-nightbtn" onClick={toggleNight} aria-label="테마 전환">{night ? "☀️" : "🌙"}</button>
            <button className="td-nightbtn" onClick={() => { if (window.confirm("로그아웃할까요?")) logoutAuth(); }} aria-label="로그아웃">🚪</button>
          </div>
        </div>
        {pushMsg && <div className="td-pushmsg" onClick={() => setPushMsg("")}>{pushMsg}</div>}
        <div className="td-quotecard">
          <span className="td-quoteicon">{myTone === "a" ? "🕊️" : "🤍"}</span>
          <p className="td-quotetext">{myQuote}</p>
        </div>

        {view !== "reward" && (
          <div className="td-tabs td-glasscard">
            {["a", "b"].map((p) => (<button key={p} className={"td-tab" + (page === p ? " on" : "")} onClick={() => setPage(p)} style={{ "--tc": T[p].c1 }}><span>{T[p].emoji}</span>{names[p]}{p === me ? " (나)" : ""}</button>))}
          </div>
        )}

        {view === "today" && (<>
          {mine && Object.keys(days).filter((d) => !d.startsWith("__")).length === 0 && (
            <div className="td-card td-onboard">
              <div className="td-onboardhead">🌱 우리의 하루, 시작해볼까요?</div>
              <div className="td-onboardstep"><b>1</b><span>아래에서 <b>잠든 시간·기분</b>만 기록해도 포인트를 받아요 (다 채우면 보너스!)</span></div>
              <div className="td-onboardstep"><b>2</b><span><b>오늘의 질문</b>에 답하면 연인의 답이 열려요 💌</span></div>
              <div className="td-onboardstep"><b>3</b><span>🔔 버튼으로 <b>알림</b>을 켜면 연인의 기록 소식을 받아요</span></div>
            </div>
          )}
          {mine && (
            <div className="td-qcard td-card">
              <div className="td-qhead">💕 {isToday ? "오늘의 질문" : `${parseInt(date.slice(5,7))}월 ${parseInt(date.slice(8,10))}일의 질문`}</div>
              <p className="td-qtext">{todayQ}</p>
              {!myAns ? (
                isToday ? (
                <div className="td-qanswer">
                  <input className="td-input" placeholder="답을 적으면 상대 답이 열려요" value={qInput} onChange={(ev) => setQInput(ev.target.value)} />
                  <button className="td-qbtn" onClick={saveAnswer}>답하기</button>
                </div>
                ) : <div className="td-qwait">이날은 답하지 않았어요</div>
              ) : (
                <div className="td-qdone">
                  <div className="td-qbubble me"><b>나</b><span>{myAns.answer}</span></div>
                  {partnerAns ? <div className="td-qbubble partner"><b>{names[me === "a" ? "b" : "a"]}</b><span>{partnerAns.answer}</span></div>
                    : <div className="td-qwait">{names[me === "a" ? "b" : "a"]}의 답을 기다리는 중… 🕊️</div>}
                </div>
              )}
            </div>
          )}
          {mine && inboxLetters.length > 0 && (
            <button className="td-letterbanner td-card" onClick={() => openMessage(inboxLetters[0])}>
              <span className="td-lettericon">💌</span>
              <div><b>{names[me === "a" ? "b" : "a"]}이(가) 남긴 쪽지가 도착했어요</b><small>탭해서 열어보기</small></div>
            </button>
          )}
          {mine && recentCheers.length > 0 && (
            <div className="td-cheerfeed td-card">
              {recentCheers.map((c) => <div key={c.id} className="td-cheernote">💬 {c.message}</div>)}
            </div>
          )}
          {!mine && <div className="td-viewonly">👀 {names[page]}의 하루 · 응원볼만 보낼 수 있어요{lastSeen[page] && <span className="td-presence">🕐 {relTime(lastSeen[page])}에 기록했어요 💭</span>}</div>}
          <div className="td-datenav">
            <button onClick={() => setDate(addDays(date, -1))} aria-label="이전">‹</button>
            <div className="td-date"><b>{md}</b><small>{dow}요일{isToday ? " · 오늘" : ""}</small>{!isToday && <button className="td-gototoday" onClick={() => setDate(today())}>오늘로 ↩</button>}</div>
            <button onClick={() => setDate(addDays(date, 1))} disabled={isToday} aria-label="다음">›</button>
          </div>

          <div className="td-hero td-card">
            {mine && ringDone > 0 && ringDone < ringTotal && <div className="td-lighthint">조금만 기록해도 +2p, 다 채우면 +10p 💪</div>}
            <svg className="td-ring" viewBox="0 0 46 46" aria-hidden="true">
              <circle cx="23" cy="23" r="18" fill="none" stroke="var(--soft)" strokeWidth="5" />
              <circle cx="23" cy="23" r="18" fill="none" stroke="var(--c1)" strokeWidth="5" strokeLinecap="round" strokeDasharray={2 * Math.PI * 18} strokeDashoffset={2 * Math.PI * 18 * (1 - ringDone / Math.max(1, ringTotal))} transform="rotate(-90 23 23)" style={{ transition: "stroke-dashoffset .6s" }} />
              <text x="23" y="27" textAnchor="middle" fontSize="11" fill="var(--ink)" fontFamily="Jua">{ringDone}/{ringTotal}</text>
            </svg>
            <div className="td-buddywrap">
              <AvatarDeco avatar={g.avatar} owned={ownedSets[page]} big>
                <div className={"td-buddy td-breathe lvl" + lvl + (viewedComplete ? " done" : "")}>
                  <Character id={charOf(page)} mood={buddyMood} />
                  {lvl > 0 && <span className="td-spark s1">✨</span>}
                  {lvl > 1 && <span className="td-spark s2">✨</span>}
                  {lvl > 2 && <span className="td-spark s3">⭐</span>}
                </div>
              </AvatarDeco>
              <div className="td-name">{names[page]}<span className="td-badge">{t.emoji}{t.type}</span></div>
              <div className="td-streak">🔥 {streak}일 연속{lvl > 0 ? ` · Lv.${lvl}` : ""}</div>
            </div>

            {bedNudge && <div className="td-nudge">{bedNudge}</div>}

            <div className="td-sleepcard">
              <div className="td-sleephead"><span>😴 오늘 수면</span><b className="td-bigsleep">{mins != null ? <CountUp value={mins} format={fmtSleep} /> : "—"}</b></div>
              <div className="td-times">
                <label><i>🌙 잘 때</i><input type="time" value={e.bed} disabled={!mine} onChange={(ev) => updateEntry(page, { bed: ev.target.value })} /></label>
                <label><i>☀️ 일어난 때</i><input type="time" value={e.wake} disabled={!mine} onChange={(ev) => updateEntry(page, { wake: ev.target.value })} /></label>
              </div>
              {mine && yb && (!e.bed || !e.wake) && <button className="td-yesterday" onClick={() => updateEntry(page, { bed: yb.bed, wake: yb.wake })}>↩ 어제와 같게 ({yb.bed} → {yb.wake})</button>}
              <div className="td-charge"><div className="td-chargefill" style={{ width: charge + "%" }}><span className="td-shimmer" /></div></div>
              <div className="td-moodmsg">{mood.emoji} {mood.msg}</div>
              <div className="td-goalhint">🎯 목표 취침 {g.bedtime} · 기상 {g.wake} · {g.sleepHours}시간</div>
            </div>
          </div>

          <div className="td-statstrip td-card">
            <div className="td-stat">
              {(() => { const pg = pgoalOf(page); if (!pg) return (<><span>🎯 개인 목표</span><b style={{ color: "var(--muted)", fontSize: 11 }}>설정에서 만들어보세요</b></>); const bons = bonusEval(page, weekDates(today())); const extra = bons.filter((b) => b.met).reduce((a, b) => a + b.reward, 0); const effLim = pg.weeklyLimit + extra; const st = pgStatus(pg, cur, effLim); const pct = Math.min(100, Math.round((cur.pgSum / effLim) * 100)); return (<>
                <span>{pg.emoji} {pg.label}</span>
                <div className="td-progbar"><div className="td-progfill" style={{ width: pct + "%", background: st.c }} /></div>
                <b style={{ color: st.c }}>{fmtPg(pg, cur.pgSum)}/{fmtPg(pg, effLim)}{extra > 0 ? ` (+${extra})` : ""}{pg.countLimit > 0 ? ` · ${cur.pgDays}/${pg.countLimit}회` : ""}</b>
                {bons.map((b) => <b key={b.id} style={{ color: b.met ? "#3DAE7B" : "var(--muted)", fontSize: 10 }}>{b.met ? `🎉 ${b.emoji} ${b.label} ${b.days}일 성공! +${b.reward}${pg.unit}` : `${b.emoji} ${b.label} ${b.days}/${b.minDays}일`}</b>)}
              </>); })()}
            </div>
            <div className="td-stat">
              <span>🧾 수면 빚</span>
              <b style={{ color: sdColor, fontSize: 15 }}>{sd.debt === 0 ? (sd.n > 0 ? "없음 🎉" : "—") : fmtSleep(sd.debt)}</b>
              <b style={{ color: "var(--muted)", fontSize: 10 }}>최근 14일</b>
            </div>
            <div className="td-stat">
              <span>💪 운동</span>
              <div className="td-progbar"><div className="td-progfill" style={{ width: exPct + "%" }} /></div>
              <b>{cur.exDays}/{g.exerciseWeekly}회</b>
            </div>
          </div>

          <div className="td-card td-maincard">
            {[
              ...(pgoalOf(page) ? [(() => { const pg = pgoalOf(page); const checks = bonusRulesOf(page).filter((r) => r.type === "daily_check"); return { k: "pg", label: `${pg.emoji} ${pg.label}`, filled: e.pg != null || checks.some((r) => e.bonus && e.bonus[r.id]), sum: e.pg == null ? "미기록" : (Number(e.pg) === 0 ? "0! 완벽해요 👏" : fmtPg(pg, Number(e.pg))),
                body: (<div>
                  <div className="td-mealrow"><span>오늘 {pg.label}</span><input className="td-input td-mealinput" type="number" min="0" inputMode="numeric" placeholder={`숫자 입력 (${pg.unit})`} value={e.pg == null ? "" : e.pg} disabled={!mine} onChange={(ev) => updateEntry(page, { pg: ev.target.value === "" ? null : Math.max(0, parseInt(ev.target.value) || 0) })} /></div>
                  {e.pg === 0 && <div className="td-zeropraise">🎉 오늘 {pg.label} 0! 참은 거 너무 잘했어 👏</div>}
                  {checks.map((r) => { const on = !!(e.bonus && e.bonus[r.id]); return <button key={r.id} className={"td-bonuschk" + (on ? " on" : "")} disabled={!mine} onClick={() => updateEntry(page, { bonus: { ...(e.bonus || {}), [r.id]: !on } })}>{on ? "✅" : "⬜"} {r.emoji} 오늘 {r.label} 성공!</button>; })}
                </div>) }; })()] : []),
              { k: "ex", label: "💪 운동", filled: !!e.exercise, sum: e.exercise ? ("완료" + (e.exNote ? " · " + e.exNote : "")) : "미기록",
                body: (<>
                  <button className={"td-toggle" + (e.exercise ? " on" : "")} onClick={onExercise} disabled={!mine}>{e.exercise ? "✓ 오늘 운동 완료!" : "오늘 운동했어?"}</button>
                  {e.exercise && <input className="td-input" placeholder="뭐 했어? (예: 런닝 30분)" value={e.exNote} disabled={!mine} onChange={(ev) => updateEntry(page, { exNote: ev.target.value })} />}
                </>) },
              { k: "snack", label: "🍪 간식", filled: e.snack >= 0, sum: e.snack >= 0 ? (SNACKS[e.snack] + (e.snackNote ? " · " + e.snackNote : "")) : "미기록",
                body: (<>
                  <div className="td-chips">{SNACKS.map((s, i) => (<button key={i} className={"td-chip" + (e.snack === i ? " on" : "")} disabled={!mine} onClick={() => updateEntry(page, { snack: e.snack === i ? -1 : i })}>{s}</button>))}</div>
                  {e.snack > 0 && <input className="td-input" placeholder="뭐 먹었어? (예: 초콜릿, 과자)" value={e.snackNote} disabled={!mine} onChange={(ev) => updateEntry(page, { snackNote: ev.target.value })} />}
                </>) },
              { k: "mood", label: "🙂 오늘 기분", filled: (e.mood || 0) > 0, sum: (e.mood || 0) > 0 ? MOODS[e.mood - 1] : "미기록",
                body: (<div className="td-chips">{MOODS.map((m2, i) => (<button key={i} className={"td-chip td-moodchip" + (e.mood === i + 1 ? " on" : "")} disabled={!mine} onClick={() => updateEntry(page, { mood: e.mood === i + 1 ? 0 : i + 1 })}>{m2}</button>))}</div>) },
              ...(trackMealsFor(page) ? [{ k: "meals", label: "🍽️ 오늘의 식단", cls: " td-meals", filled: !!(e.meals.breakfast || e.meals.lunch || e.meals.dinner), sum: [e.meals.breakfast, e.meals.lunch, e.meals.dinner].filter(Boolean).join(" / ") || "미기록",
                body: (<>
                  <div className="td-mealrow"><span>🌅 아침</span><input className="td-input td-mealinput" placeholder="아침에 뭐 먹었어?" value={e.meals.breakfast} disabled={!mine} onChange={(ev) => updateMeal(page, "breakfast", ev.target.value)} /></div>
                  <div className="td-mealrow"><span>🌞 점심</span><input className="td-input td-mealinput" placeholder="점심에 뭐 먹었어?" value={e.meals.lunch} disabled={!mine} onChange={(ev) => updateMeal(page, "lunch", ev.target.value)} /></div>
                  <div className="td-mealrow"><span>🌙 저녁</span><input className="td-input td-mealinput" placeholder="저녁에 뭐 먹었어?" value={e.meals.dinner} disabled={!mine} onChange={(ev) => updateMeal(page, "dinner", ev.target.value)} /></div>
                </>) }] : []),
              { k: "grat", label: "⭐ 오늘의 3감사", cls: " td-gratblock", labelCls: " td-gratlabel", filled: (e.gratitude || []).some((x) => (x || "").trim()), sum: (e.gratitude || []).filter((x) => (x || "").trim()).length ? (e.gratitude || []).filter((x) => (x || "").trim()).length + "개 작성" : "미기록",
                body: (<>{[0, 1, 2].map((i) => (<textarea key={i} className="td-input td-gratinput td-autogrow" rows={1} placeholder={`${i + 1}. 감사한 일`} value={e.gratitude[i]} disabled={!mine} ref={autoGrowRef} onInput={autoGrow} onChange={(ev) => { const gg = [...e.gratitude]; gg[i] = ev.target.value; updateEntry(page, { gratitude: gg }); }} />))}</>) },
              { k: "refl", label: "📓 한 줄 후기", filled: !!(e.reflection || "").trim(), sum: (e.reflection || "").trim() ? ((e.reflection || "").length > 22 ? (e.reflection || "").slice(0, 22) + "…" : e.reflection) : "미기록",
                body: (<textarea className="td-area td-autogrow" rows={2} placeholder="오늘 하루는 어땠어?" value={e.reflection} disabled={!mine} ref={autoGrowRef} onInput={autoGrow} onChange={(ev) => updateEntry(page, { reflection: ev.target.value })} />) },
            ].map((b) => {
              const open = openSet[b.k] != null ? openSet[b.k] : (mine ? !initFilled[b.k] : false);
              return (
                <div key={b.k} className={"td-block" + (b.cls || "")}>
                  <button className="td-bhead" onClick={() => setOpenSet((o) => ({ ...o, [b.k]: !open }))}>
                    <span className={"td-blabel2" + (b.labelCls || "")}>{b.label}</span>
                    {!open && <span className={"td-bsum" + (b.filled ? " ok" : "")}>{b.filled ? "✓ " : ""}{b.sum}</span>}
                    <i className="td-bcaret">{open ? "▴" : "▾"}</i>
                  </button>
                  {open && <div className="td-bbody">{b.body}</div>}
                </div>
              );
            })}
            {(e.cheers > 0 || !mine) && (
              <div className="td-cheerrow">
                {e.cheers > 0 && <span className="td-cheercount">받은 응원 {e.cheers}</span>}
                {!mine && (
                  <button className="td-cheerbtn" onClick={() => setShowCheerBox((v) => !v)}>
                    <span className="td-ball" style={{ "--bt": t.c1 }}><span className="td-balltop" /><span className="td-ballband" /><span className="td-ballbtn">♥</span></span>{names[page]}에게 응원 보내기
                    {burstKey > 0 && <span className="td-burst" key={burstKey}>{[...Array(8)].map((_, i) => <b key={i} style={{ "--tx": (i * 10 - 35) + "px", "--dl": (i % 4) * 0.05 + "s" }}>♥</b>)}</span>}
                  </button>
                )}
              </div>
            )}
            {!mine && showCheerBox && (
              <div className="td-cheerbox">
                <div className="td-cheerpresets">{(CHEER_PRESETS_BY_SLOT[me] || CHEER_PRESETS).map((p, i) => <button key={i} onClick={() => sendCheerMsg(page, p)}>{p}</button>)}</div>
                <div className="td-cheercustom">
                  <input className="td-input" placeholder="직접 한마디 적기…" value={cheerText} onChange={(ev) => setCheerText(ev.target.value)} />
                  <button className="td-qbtn" onClick={() => sendCheerMsg(page, cheerText)}>보내기</button>
                </div>
                <button className="td-cheeronly" onClick={() => sendCheerMsg(page, "")}>메시지 없이 응원볼만 던지기</button>
              </div>
            )}
            {mine && (
              <div className="td-savebar">
                <button className="td-savebtn" onClick={() => flushSave(page)}>💾 지금 저장하기</button>
                {savedFlash && savedFlash.slot === page && <span className="td-savedok">저장됨 ✓</span>}
              </div>
            )}
          </div>

          <button className="td-goalbtn td-card" onClick={() => setShowGoals((v) => !v)}>🎯 {names[page]} {mine ? "목표 설정" : "목표 보기"} {showGoals ? "▲" : "▼"}</button>
          {showGoals && (
            <div className="td-goalpanel td-card">
              <div className="td-goalrow"><label>이름</label><input type="text" value={g.name || ""} placeholder={THEME[page].name} disabled={!mine} onChange={(ev) => saveGoal(page, { name: ev.target.value })} style={{ width: 140 }} /></div>
              <div className="td-goalrow td-goalcol"><label>캐릭터</label>
                <div className="td-charpick">
                  {Object.entries(CHARACTERS).map(([cid, c]) => (
                    <button key={cid} className={"td-charbtn" + (charOf(page) === cid ? " on" : "")} disabled={!mine} onClick={() => saveGoal(page, { charId: cid })}>
                      <span className="td-charprev"><Character id={cid} mood="happy" /></span><i>{c.name}</i>
                    </button>
                  ))}
                </div>
              </div>
              <div className="td-goalrow td-goalcol"><label>테마 색</label>
                <div className="td-palpick">
                  {Object.entries(PALETTES).map(([pid, p]) => (
                    <button key={pid} className={"td-palbtn" + (((g.palette) || (page === "a" ? "coral" : "fairy")) === pid ? " on" : "")} disabled={!mine} style={{ background: `linear-gradient(135deg,${p.c1},${p.c2})` }} onClick={() => saveGoal(page, { palette: pid })} />
                  ))}
                </div>
              </div>
              <div className="td-goalrow"><label>🍽️ 식단 기록</label><button className={"td-exbtn" + (trackMealsFor(page) ? " on" : "")} disabled={!mine} onClick={() => saveGoal(page, { trackMeals: !trackMealsFor(page) })}>{trackMealsFor(page) ? "켬" : "끔"}</button></div>
              <div className="td-goalrow"><label>아침 문구 톤</label>
                <div className="td-chips" style={{ flex: "0 0 auto" }}>
                  {[["a", "🕊️ 담담"], ["b", "🤍 다정"]].map(([tn, lb]) => (
                    <button key={tn} className={"td-chip" + ((((g.quoteTone === "a" || g.quoteTone === "b") ? g.quoteTone : page) === tn) ? " on" : "")} disabled={!mine} onClick={() => saveGoal(page, { quoteTone: tn })} style={{ flex: "0 0 auto", padding: "8px 12px" }}>{lb}</button>
                  ))}
                </div>
              </div>
              <div className="td-goalrow td-goalcol"><label>취침 알림 문구</label><input type="text" value={g.bedMsg || ""} placeholder="이제 잘 시간이야. 푹 자 🌙" disabled={!mine} onChange={(ev) => saveGoal(page, { bedMsg: ev.target.value })} /></div>
              <div className="td-goalrow"><label>목표 취침</label><input type="time" value={g.bedtime} disabled={!mine} onChange={(ev) => saveGoal(page, { bedtime: ev.target.value })} /></div>
              <div className="td-goalrow"><label>목표 기상</label><input type="time" value={g.wake} disabled={!mine} onChange={(ev) => saveGoal(page, { wake: ev.target.value })} /></div>
              <div className="td-goalrow"><label>목표 수면(시간)</label><input type="number" step="0.5" min="4" max="12" value={g.sleepHours} disabled={!mine} onChange={(ev) => saveGoal(page, { sleepHours: parseFloat(ev.target.value) || 7.5 })} /></div>
              <div className="td-goalrow"><label>주간 운동(회)</label><input type="number" min="1" max="7" value={g.exerciseWeekly} disabled={!mine} onChange={(ev) => saveGoal(page, { exerciseWeekly: parseInt(ev.target.value) || 4 })} /></div>
              <div className="td-goalrow td-goaldays"><label>운동 요일</label><div className="td-daychips">{DOW_MON.map((d, i) => { const on = (g.exerciseDays || []).includes(i); return <button key={i} className={"td-daychip" + (on ? " on" : "")} disabled={!mine} onClick={() => { const arr = new Set(g.exerciseDays || []); on ? arr.delete(i) : arr.add(i); saveGoal(page, { exerciseDays: [...arr] }); }}>{d}</button>; })}</div></div>
              <div className="td-goalsec">🎯 개인 목표 (주간 한도)</div>
              {!g.pgoal ? (
                <button className="td-goalbtn" disabled={!mine} onClick={() => saveGoal(page, { pgoal: { emoji: "🎯", label: "나의 목표", unit: "분", weeklyLimit: 420, countLimit: 0 } })}>+ 개인 목표 만들기</button>
              ) : (<>
                <div className="td-goalrow"><label>이름</label><input type="text" value={g.pgoal.label} disabled={!mine} onChange={(ev) => saveGoal(page, { pgoal: { ...g.pgoal, label: ev.target.value } })} /></div>
                <div className="td-goalrow"><label>이모지</label><input type="text" maxLength="2" value={g.pgoal.emoji} disabled={!mine} onChange={(ev) => saveGoal(page, { pgoal: { ...g.pgoal, emoji: ev.target.value } })} /></div>
                <div className="td-goalrow"><label>단위</label><input type="text" maxLength="6" value={g.pgoal.unit} disabled={!mine} onChange={(ev) => saveGoal(page, { pgoal: { ...g.pgoal, unit: ev.target.value } })} /></div>
                <div className="td-goalrow"><label>주간 한도 ({g.pgoal.unit})</label><input type="number" min="1" value={g.pgoal.weeklyLimit} disabled={!mine} onChange={(ev) => saveGoal(page, { pgoal: { ...g.pgoal, weeklyLimit: parseInt(ev.target.value) || 1 } })} /></div>
                <div className="td-goalrow"><label>주간 횟수 한도 (0=없음)</label><input type="number" min="0" max="7" value={g.pgoal.countLimit || 0} disabled={!mine} onChange={(ev) => saveGoal(page, { pgoal: { ...g.pgoal, countLimit: parseInt(ev.target.value) || 0 } })} /></div>
                {mine && <button className="td-goalbtn" style={{ color: "#DC6B57" }} onClick={() => { if (window.confirm("개인 목표를 삭제할까요?")) saveGoal(page, { pgoal: null }); }}>목표 삭제</button>}
              </>)}
            </div>
          )}
        </>)}

        {view === "review" && (<>
          <div className="td-review td-card">
            <h3>🗂️ 주차별 기록</h3>
            {(() => {
              const pg = pgoalOf(page);
              const rows = [0, 1, 2, 3].map((wAgo) => {
                const ref = addDays(today(), -7 * wAgo);
                const arr = weekDates(ref);
                const m = metricsFor(page, arr);
                const sleepDays = arr.filter((dk) => { if (dk > today()) return false; const en = days[dk]?.[page]; const mm = en ? sleepMinutes(en.bed, en.wake) : null; return mm != null && mm >= (g.sleepHours - 0.5) * 60; }).length;
                const bons = pg ? bonusEval(page, arr) : [];
                const extra = bons.filter((b) => b.met).reduce((a, b) => a + b.reward, 0);
                const st = pg ? pgStatus(pg, m, pg.weeklyLimit + extra) : null;
                const label = wAgo === 0 ? "이번 주" : wAgo === 1 ? "지난주" : `${wAgo}주 전`;
                return { label, sleepDays, m, st };
              });
              return rows.map((r, i) => (
                <div key={i} className="td-weekrow">
                  <b className="td-weeklb">{r.label}</b>
                  <span>😴 수면목표 {r.sleepDays}일</span>
                  {pg ? <span style={{ color: r.st.c }}>{pg.emoji} {fmtPg(pg, r.m.pgSum)}{pg.countLimit > 0 ? ` · ${r.m.pgDays}회` : ""} <b>{r.m.pgDays === 0 && r.m.pgSum === 0 && i > 0 ? "기록 없음" : r.st.txt}</b></span> : <span style={{ color: "var(--muted)" }}>개인 목표 없음</span>}
                </div>
              ));
            })()}
          </div>
          <div className="td-review td-card">
            <h3>📊 {names[page]} 이번 주 리뷰</h3>
            {headline && !fb.empty && <p className="td-headline">{headline}</p>}
            {fb.empty ? (<p className="td-reviewempty">이번 주 기록을 채우면 리뷰가 나와요 🙂</p>) : (<>
              {fb.good.length > 0 && <div className="td-fbgood">👏 잘한 점: {fb.good.join(" · ")}</div>}
              <div className="td-reviewgrid">
                <div className="td-rv"><span>평균 수면</span><b>{cur.avg ? fmtSleep(cur.avg) : "—"}</b></div>
                <div className="td-rv"><span>취침 규칙성</span><b style={{ color: reg.c }}>{reg.txt}</b></div>
                <div className="td-rv"><span>운동</span><b>{cur.exDays}/{g.exerciseWeekly}회</b></div>
                <div className="td-rv"><span>수면 빚(14일)</span><b style={{ color: sdColor }}>{sd.debt === 0 ? "없음 🎉" : fmtSleep(sd.debt)}</b></div>
                <div className="td-rv"><span>지난주 대비</span><b>{fb.trend || "—"}</b></div>
                <div className="td-rv"><span>기록한 날</span><b>{cur.logged}일</b></div>
              </div>
              {moodTip && <div className="td-fbgood">💡 {moodTip}</div>}
              {fb.tip.length > 0 && <div className="td-fbtip">🌱 다음 주 제안: {fb.tip[0]}</div>}
            </>)}
          </div>
          <div className="td-couple td-card">
            <h3>💞 이번 주 우리 둘</h3>
            <div className="td-couplerow">
              <div className="td-rv"><span>함께 기록한 날</span><b>{cw.bothDays}일</b></div>
              <div className="td-rv"><span>주고받은 응원</span><b>{cw.cheersTotal}개</b></div>
            </div>
            <p className="td-couplemsg">{cw.bothDays >= 5 ? "이번 주도 둘 다 꾸준했어요, 최고! 🎉" : cw.bothDays >= 2 ? "함께 쌓아가는 중이에요 🌱" : "이번 주도 같이 시작해볼까요? 😊"}</p>
          </div>
          <div className="td-monthreport td-card">
            <h3>📅 {names[page]} 이번 달 리포트</h3>
            {thisMonth.nSleep === 0 ? (<p className="td-reviewempty">이번 달 기록을 채우면 리포트가 나와요 🙂</p>) : (<>
              <div className="td-reviewgrid">
                <div className="td-rv"><span>이번 달 평균 수면</span><b>{thisMonth.avg ? fmtSleep(thisMonth.avg) : "—"}</b></div>
                <div className="td-rv"><span>이번 달 규칙성</span><b style={{ color: monthRegLabel.c }}>{monthRegLabel.txt}</b></div>
                <div className="td-rv"><span>이번 달 운동</span><b>{thisMonth.exDays}회</b></div>
                <div className="td-rv"><span>지난 달 대비</span><b>{lastMonth.avg && thisMonth.avg ? (thisMonth.avg > lastMonth.avg + 15 ? "더 잤어요 ↑" : thisMonth.avg < lastMonth.avg - 15 ? "덜 잤어요 ↓" : "비슷해요 →") : "—"}</b></div>
              </div>
              <div className="td-fbtip">📆 이번 주 평균({cur.avg ? fmtSleep(cur.avg) : "—"})이 이번 달 평균({thisMonth.avg ? fmtSleep(thisMonth.avg) : "—"})보다 {(cur.avg && thisMonth.avg) ? (cur.avg > thisMonth.avg ? "좋은 흐름이에요 👍" : cur.avg < thisMonth.avg ? "살짝 아쉬워요, 이번 주 조금 더 챙겨봐요 🌱" : "비슷해요") : "데이터가 더 필요해요"}</div>
            </>)}
          </div>
          <div className="td-week td-card">
            <h3>🛌 이번 주 수면 리듬</h3>
            <div className="td-bars">
              {thisWeek.map((dk) => {
                const dd = days[dk] || {}; const ma = sleepMinutes(dd.a?.bed, dd.a?.wake); const mb = sleepMinutes(dd.b?.bed, dd.b?.wake); const lab = labelDate(dk);
                return (<button key={dk} className={"td-daycol" + (dk === date ? " sel" : "")} onClick={() => { setDate(dk); setView("today"); }}>
                  <div className="td-barpair"><span className="td-bar" style={{ height: (ma ? Math.min(100, ma / 540 * 100) : 0) + "%", background: T.a.c1 }} /><span className="td-bar" style={{ height: (mb ? Math.min(100, mb / 540 * 100) : 0) + "%", background: T.b.c1 }} /></div>
                  <span className="td-daylab">{lab.short}</span>
                </button>);
              })}
            </div>
            <div className="td-legend"><span><i style={{ background: T.a.c1 }} />{names.a}</span><span><i style={{ background: T.b.c1 }} />{names.b}</span></div>
          </div>
        </>)}

        {view === "calendar" && (
          <div className="td-month td-card">
            <div className="td-monthhead">
              <button onClick={() => { const [y, m] = monthRef.split("-").map(Number); setMonthRef(ymd(new Date(y, m - 2, 1))); }}>‹</button>
              <h3>🗓️ {my_}년 {mm_}월 · {names[page]}</h3>
              <button onClick={() => { const [y, m] = monthRef.split("-").map(Number); setMonthRef(ymd(new Date(y, m, 1))); }}>›</button>
            </div>
            <div className="td-monthdow">{DOW_MON.map((d) => <span key={d}>{d}</span>)}</div>
            <div className="td-monthgrid">
              {monthCells.map((dk, i) => {
                if (!dk) return <span key={"e" + i} className="td-mcell empty" />;
                const en = days[dk]?.[page]; const mm = en ? sleepMinutes(en.bed, en.wake) : null;
                const slept = mm != null; const goalMet = mm != null && mm >= (g.sleepHours - 0.5) * 60; const pgRec = en?.pg != null && en?.pg !== "";
                const dnum = parseInt(dk.split("-")[2], 10);
                return (<button key={dk} className={"td-mcell" + (dk === date ? " sel" : "")} onClick={() => { setDate(dk); setView("today"); }} style={{ background: goalMet ? "var(--soft)" : (slept ? "var(--soft2)" : "transparent") }}>
                  <span className="td-mnum">{dnum}</span>{pgRec && <span className="td-mdot" style={{ background: t.c1 }} />}
                </button>);
              })}
            </div>
            <div className="td-mlegend"><span><i style={{ background: "var(--soft)" }} />수면목표</span><span><i className="dot" style={{ background: t.c1 }} />{pgoalOf(page) ? `${pgoalOf(page).emoji} ${pgoalOf(page).label}` : "개인 목표"}</span></div>
          </div>
        )}

        {view === "reward" && (<>
          <div className="td-mileherocard td-card">
            <div className="td-milerow">
              <div className="td-milecol" style={{ "--mc": T[me].c1 }}>
                <span className="td-mileemoji">{T[me].emoji}</span>
                <span className="td-milename">{names[me]} (나)</span>
                <span className="td-milenum"><CountUp value={myBal} /><i>p</i></span>
              </div>
              <div className="td-milediv">💞</div>
              <div className="td-milecol td-sub" style={{ "--mc": T[partner].c1 }}>
                <span className="td-mileemoji">{T[partner].emoji}</span>
                <span className="td-milename">{names[partner]}</span>
                <span className="td-milenum"><CountUp value={me === "a" ? balB : balA} /><i>p</i></span>
              </div>
            </div>
            {nextGoal ? (
              <div className="td-milegoal">
                <div className="td-milegoalbar"><div style={{ width: Math.min(100, Math.round((myBal / nextGoal.cost) * 100)) + "%" }} /></div>
                <span>🎯 {nextGoal.emoji} <b>{nextGoal.title}</b>까지 {nextGoal.cost - myBal}p 남았어요</span>
              </div>
            ) : (sortedCat.length > 0 && <div className="td-milegoal"><span>✨ 지금 모든 리워드를 교환할 수 있어요!</span></div>)}
            {affordableCnt > 0 && nextGoal && <p className="td-milesub">지금 바로 교환 가능한 리워드 {affordableCnt}개 🎉</p>}
          </div>

          {redeemMsg && <div className="td-pushmsg" onClick={() => setRedeemMsg("")}>{redeemMsg}</div>}

          <div className="td-card td-lovecard">
            <h3 className="td-rewardh3">💝 마음 보내기</h3>
            <div className="td-lovegrid">
              <div className="td-lovebox">
                <span className="td-loveemoji">🎁</span><b>포인트 선물</b>
                <div className="td-loverow"><input className="td-input" type="number" placeholder="포인트" value={giftInput} onChange={(ev) => setGiftInput(ev.target.value)} /><button className="td-qbtn" onClick={sendGift}>보내기</button></div>
                <small>{names[me === "a" ? "b" : "a"]}에게 내 포인트를 나눠줘요</small>
              </div>
            </div>
            <div className="td-lovebox td-letterwrite">
              <span className="td-loveemoji">💌</span><b>몰래 쪽지 숨기기</b>
              <textarea className="td-area td-autogrow" rows={2} placeholder={`${names[me === "a" ? "b" : "a"]}에게 남길 따뜻한 한마디…`} value={letterInput.msg} onChange={(ev) => setLetterInput((s) => ({ ...s, msg: ev.target.value }))} />
              <div className="td-loverow"><label className="td-letterlabel">배달 날짜</label><input className="td-input" type="date" value={letterInput.date} min={today()} onChange={(ev) => setLetterInput((s) => ({ ...s, date: ev.target.value }))} /><button className="td-qbtn" onClick={sendLetter}>숨기기</button></div>
              <small>그날 아침, 상대에게 깜짝 쪽지가 도착해요</small>
            </div>
          </div>

          {redeems.filter((r) => r.requester !== me && r.status === "pending").length > 0 && (
            <div className="td-card td-incoming">
              <h3 className="td-rewardh3">💌 {names[partner]}이(가) 보낸 요청</h3>
              {redeems.filter((r) => r.requester !== me && r.status === "pending").map((r) => (
                <div key={r.id} className="td-ticket">
                  <span className="td-ticketicon">🎁</span>
                  <div className="td-ticketbody"><b>{r.title}</b><small>{r.cost}p 사용 · {(r.requested_at || "").slice(5, 10).replace("-", "/")}</small></div>
                  <button className="td-ticketbtn" onClick={() => confirmRedeem(r.id)}>완료 ✓</button>
                </div>
              ))}
            </div>
          )}

          <div className="td-card td-shopcard">
            <div className="td-shophead">
              <h3 className="td-rewardh3">🛍️ 리워드 상점</h3>
              {sortedCat.length > 0 && <button className="td-editbtn" onClick={() => setShopEdit((v) => !v)}>{shopEdit ? "완료" : "편집"}</button>}
            </div>
            {sortedCat.length === 0 && (
              <div className="td-seedbox">
                <span className="td-seedemoji">🎁</span>
                <p>아직 리워드가 없어요!</p>
                <button className="td-seedbtn" onClick={seedDefaults}>💝 추천 리워드 한번에 담기</button>
              </div>
            )}
            <div className="td-rgrid">
              {sortedCat.map((c) => {
                const can = myBal >= c.cost;
                const tier = c.cost < 100 ? " t1" : c.cost < 300 ? " t2" : " t3";
                return (
                  <div key={c.id} className={"td-rcard" + tier + (can ? "" : " locked")}>
                    {shopEdit && <button className="td-rdel" onClick={() => deleteReward(c.id)}>✕</button>}
                    <span className="td-remoji">{c.emoji}</span>
                    <b className="td-rtitle">{c.title}</b>
                    <span className="td-rprice">🪙 {c.cost}p</span>
                    <button className={"td-rbtn" + (can ? "" : " lock")} disabled={!can || shopEdit} onClick={() => doRedeem(c)}>{can ? "교환하기" : `🔒 ${c.cost - myBal}p 더`}</button>
                  </div>
                );
              })}
            </div>
            <button className="td-addtoggle" onClick={() => setShowAdd((v) => !v)}>{showAdd ? "닫기 ▴" : "＋ 나만의 리워드 추가"}</button>
            {showAdd && (
              <div className="td-addpanel">
                <div className="td-emojirow">
                  {["🎁", "☕", "🍰", "🎬", "💆", "🍳", "🧹", "🌟", "✈️", "🛍️", "🎮", "💐"].map((em) => (
                    <button key={em} className={"td-emojichip" + (newReward.emoji === em ? " on" : "")} onClick={() => setNewReward((s) => ({ ...s, emoji: em }))}>{em}</button>
                  ))}
                </div>
                <div className="td-addrow">
                  <input className="td-input td-addtitle" placeholder="리워드 이름" value={newReward.title} onChange={(ev) => setNewReward((s) => ({ ...s, title: ev.target.value }))} />
                  <input className="td-input td-addcost" type="number" placeholder="가격(p)" value={newReward.cost} onChange={(ev) => setNewReward((s) => ({ ...s, cost: ev.target.value }))} />
                </div>
                <button className="td-addbtn2" onClick={addReward}>추가하기</button>
              </div>
            )}
          </div>

          {redeems.filter((r) => r.requester === me).length > 0 && (
            <div className="td-card td-shopcard">
              <h3 className="td-rewardh3">📜 내가 보낸 요청</h3>
              {redeems.filter((r) => r.requester === me).slice(0, 6).map((r) => (
                <div key={r.id} className={"td-ticket" + (r.status === "done" ? " done" : "")}>
                  <span className="td-ticketicon">{r.status === "done" ? "✅" : "⏳"}</span>
                  <div className="td-ticketbody"><b>{r.title}</b><small>{r.cost}p · {r.status === "done" ? "완료됨 🎉" : "대기 중"}</small></div>
                </div>
              ))}
            </div>
          )}

          <div className="td-card td-shopcard">
            <h3 className="td-rewardh3">🧾 나의 적립 내역</h3>
            {ledger.filter((r) => r.slot === me && isMile(r)).slice().sort((x, y) => (y.ref_date || "").localeCompare(x.ref_date || "")).slice(0, 8).map((r) => (
              <div key={r.id} className="td-ledgerrow">
                <span className="td-ledgerdate">{r.reason.startsWith("milestone_") ? "누적" : (r.ref_date || "").slice(5).replace("-", "/")}</span>
                <span className="td-ledgerlabel">{r.reason.startsWith("redeem_") ? "🎁 리워드 교환" : r.reason.startsWith("gift_to_") ? "💝 포인트 선물 보냄" : r.reason.startsWith("gift_from_") ? "💝 포인트 선물 받음" : r.reason.startsWith("giftitem_") ? "💝 아이템 선물" : r.reason.startsWith("item_") ? "🛍️ 아이템 구매" : (LEDGER_LABEL[r.reason] || r.reason)}</span>
                <b className={r.delta > 0 ? "plus" : "minus"}>{r.delta > 0 ? "+" : ""}{r.delta}p</b>
              </div>
            ))}
            {ledger.filter((r) => r.slot === me).length === 0 && <p className="td-reviewempty">아직 적립 내역이 없어요.</p>}
          </div>
        </>)}

                {view === "style" && (<>
          {!styleMine && <div className="td-viewonly">👀 {names[page]}의 캐릭터를 구경하고 있어요</div>}
          <div className="td-stylehero td-card">
            <span className="td-stylebal td-kissbal">💋 <CountUp value={myKiss} /></span>
            <div className="td-stylepreview">
              <AvatarDeco avatar={goals[page] && goals[page].avatar} owned={ownedSets[page]} tryOn={styleMine ? tryOn : {}} big>
                <div className="td-buddy" style={{ width: 118, height: 118 }}><Character id={charOf(page)} mood="happy" /></div>
              </AvatarDeco>
            </div>
            {styleMine && Object.keys(tryOn).length > 0 && (
              <div className="td-tryonbar"><span>👀 입어보는 중이에요</span><button onClick={() => setTryOn({})}>원래대로</button></div>
            )}
            {styleMine && <p className="td-kisshint">💋 뽀뽀는 매일 기록하면 마일리지와 함께 쌓여요 (꾸미기 전용)</p>}
            {styleMine ? (
              <div className="td-stylesubs">
                {[["closet", "👗 옷장"], ["shop", "🛍️ 상점"], ["gacha", "🎰 뽑기"]].map(([k, l]) => (
                  <button key={k} className={styleSub === k ? "on" : ""} onClick={() => { setStyleSub(k); setTryOn({}); }}>{l}</button>
                ))}
              </div>
            ) : <p className="td-shophint">내 캐릭터를 꾸미려면 위에서 '{names[me]} (나)' 탭을 눌러요</p>}
          </div>

          {styleMine && (<>
          {redeemMsg && <div className="td-pushmsg" onClick={() => setRedeemMsg("")}>{redeemMsg}</div>}

          {giftInbox.length > 0 && (
            <button className="td-letterbanner td-card" onClick={() => setUnbox(giftInbox[0])}>
              <span className="td-lettericon">🎁</span>
              <div><b>{names[giftInbox[0].giftedBy]}이(가) 보낸 선물이 도착했어요!</b><small>탭해서 열어보기</small></div>
            </button>
          )}

          {styleSub === "closet" && (
            <div className="td-card td-shopcard">
              <h3 className="td-rewardh3">👗 내 옷장 <span className="td-ownedcnt">{inventory.filter((iv) => iv.slot === me).length}/{ITEMS.length}개</span></h3>
              {CATS.map(([cat, label]) => {
                const mine2 = ITEMS.filter((it) => it.cat === cat && ownedSets[me].has(it.id));
                const eqId = ((goals[me] && goals[me].avatar) || {})[cat] || "";
                return (
                  <div key={cat} className="td-closetrow">
                    <span className="td-decolabel">{label}</span>
                    <div className="td-decochips">
                      <button className={"td-decochip" + (!eqId ? " on" : "")} onClick={() => saveAvatar({ [cat]: "" })}>🚫</button>
                      {mine2.length === 0 && <span className="td-closetempty">상점·뽑기에서 데려와봐요 →</span>}
                      {mine2.map((it) => <button key={it.id} className={"td-decochip tier" + it.tier + (eqId === it.id ? " on" : "")} onClick={() => saveAvatar({ [cat]: it.id })}>{it.icon}</button>)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {styleSub === "shop" && (<>
            <div className="td-shopfilter">
              <button className={shopCat === "" ? "on" : ""} onClick={() => setShopCat("")}>전체</button>
              {CATS.map(([c, l]) => <button key={c} className={shopCat === c ? "on" : ""} onClick={() => setShopCat(c)}>{l}</button>)}
            </div>
            <div className="td-shopgrid">
              {ITEMS.filter((it) => !shopCat || it.cat === shopCat).map((it) => {
                const own = ownedSets[me].has(it.id);
                const can = myKiss >= it.price;
                const trying = tryOn[it.cat] === it.id;
                const partnerOwn = ownedSets[me === "a" ? "b" : "a"].has(it.id);
                return (
                  <div key={it.id} className={"td-shopitem tier" + it.tier + (trying ? " trying" : "")}>
                    <span className="td-tierbadge">{TIER_NAMES[it.tier]}</span>
                    <button className="td-itempreview" onClick={() => setTryOn((s) => { const n = { ...s }; if (trying) delete n[it.cat]; else n[it.cat] = it.id; return n; })}><ItemThumb it={it} /></button>
                    <b className="td-itemname">{it.name}</b>
                    <span className="td-itemprice">💋 {it.price}</span>
                    {own ? <span className="td-ownedtag">✓ 보유 중</span> : (
                      <div className="td-itembtns">
                        <button className="td-buybtn" disabled={!can} onClick={() => buyItem(it)}>{can ? "구매" : `🔒 ${it.price - myKiss}`}</button>
                        <button className="td-giftitembtn" disabled={!can || partnerOwn} onClick={() => setGiftItem(it)}>💝</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="td-shophint">아이템을 탭하면 미리 입어볼 수 있어요 👀</p>
          </>)}

          {styleSub === "gacha" && (
            <div className="td-card td-gachacard">
              <div className="td-gachamachine"><span className="td-gachaball">{gachaRolling ? "🎲" : "🎁"}</span></div>
              <h3 className="td-gachatitle">🎰 랜덤 뽑기</h3>
              <p className="td-gachadesc">뭘 뽑아도 아이템은 나와요! 이미 가진 등급이면 뽀뽀 일부 환급, 가끔 <b>잭팟(2배 환급)</b>도 떠요 ✨</p>
              <div className="td-gacharates">
                <span>⚪ 베이직 55%</span><span>🌿 레어 30%</span><span>💜 에픽 12%</span><span>🌟 레전 3%</span>
              </div>
              <div className="td-gachabtns">
                <button className="td-gachabtn" disabled={gachaRolling || myKiss < 20} onClick={() => doGacha(1)}>1회 뽑기<b>💋 20</b></button>
                <button className="td-gachabtn big" disabled={gachaRolling || myKiss < 180} onClick={() => doGacha(10)}>10연차<b>💋 180</b><small>마지막 에픽↑ 보장</small></button>
              </div>
            </div>
          )}
          </>)}
        </>)}

        <div className="td-foot"><span>{loading ? "동기화 중…" : "✓ 동기화 중(10초)"} · {code}</span><button onClick={logout}>코드 변경</button></div>
      </div>

      {gachaResult && (
        <div className="td-bigceleb" onClick={() => setGachaResult(null)}>
          <div className="td-gacharesult" onClick={(ev) => ev.stopPropagation()}>
            <h2>🎉 뽑기 결과</h2>
            <div className="td-gachagrid">
              {gachaResult.map((r, i) => (
                <div key={i} className={"td-gachaitem tier" + (r.tier || 1) + (r.dupe ? " dupe" : "")}>
                  <span className="td-gachaemoji">{r.dupe ? "🔁" : (r.item ? (r.item.icon || r.item.e) : "🎁")}</span>
                  <b>{r.dupe ? "중복" : (r.item ? r.item.name : "")}</b>
                  {r.dupe ? <small>+{r.refund}💋 환급</small> : <small>{TIER_NAMES[r.tier]}</small>}
                  {r.jackpot && <span className="td-jackpot">💰 잭팟! +{r.jackpotAmt}💋</span>}
                </div>
              ))}
            </div>
            <button className="td-envclose" onClick={() => setGachaResult(null)}>확인</button>
            <span className="td-bigclose">받은 아이템은 옷장에 담겼어요</span>
          </div>
        </div>
      )}
      {unbox && <UnboxOverlay data={unbox} names={names} onClose={() => setUnbox(null)} onOpened={() => { if (unbox.invId) supabase.rpc("gs2_item_open", { p_code: code, p_id: unbox.invId }).then(() => supabase.rpc("gs2_inventory_get", { p_code: code }).then(({ data }) => { if (data) setInventory(data); })); }} />}
      {giftItem && (
        <div className="td-letteropen" onClick={() => setGiftItem(null)}>
          <div className="td-envelope" onClick={(ev) => ev.stopPropagation()}>
            <div className="td-envtop">💝</div>
            <div className="td-envfrom">{names[me === "a" ? "b" : "a"]}에게 선물하기</div>
            <p className="td-envmsg">{giftItem.icon} {giftItem.name} · 💋 {giftItem.price}</p>
            <input className="td-input" placeholder="짧은 메시지 (선택)" value={giftNote} onChange={(ev) => setGiftNote(ev.target.value)} />
            <div style={{ marginTop: 14 }}><button className="td-envclose" onClick={sendItemGift}>선물 보내기 💝</button></div>
          </div>
        </div>
      )}
      {openLetter && (
        <div className="td-letteropen" onClick={() => setOpenLetter(null)}>
          <div className="td-envelope" onClick={(e) => e.stopPropagation()}>
            <div className="td-envtop">💌</div>
            <div className="td-envfrom">{names[openLetter.from_slot]}이(가) 남긴 쪽지</div>
            <p className="td-envmsg">{openLetter.message}</p>
            <button className="td-envclose" onClick={() => setOpenLetter(null)}>닫기</button>
          </div>
        </div>
      )}
      {bigCeleb && (
        <div className="td-bigceleb" key={bigCeleb.key} onClick={() => setBigCeleb(null)}>
          <div className="td-bigrays" />
          <div className="td-bigbuddy"><Character id={charOf(me)} mood="celebrate" /></div>
          <h2>{bigCeleb.title}</h2>
          <p>{bigCeleb.sub}</p>
          <span className="td-bigclose">화면을 탭하면 닫혀요</span>
          <div className="td-confetti">{[...Array(24)].map((_, i) => <b key={i} style={{ "--l": (i * 4.1) % 100 + "%", "--dl": (i % 6) * 0.1 + "s", "--rot": (i * 37) + "deg", background: i % 2 ? "#FFD980" : "#FF9EC1" }} />)}</div>
        </div>
      )}
      {celebrate && <div className="td-confetti" key={celebrate.key}>{[...Array(24)].map((_, i) => <b key={i} style={{ "--l": (i * 4.1) % 100 + "%", "--dl": (i % 6) * 0.1 + "s", "--rot": (i * 37) + "deg", background: i % 2 ? "var(--c1)" : "var(--c2)" }} />)}<div className="td-celebmsg">{celebrate.msg}</div></div>}

      <nav className="td-bottomnav td-glasscard">
        {[["today", "📝", "오늘"], ["review", "📊", "리뷰"], ["calendar", "🗓️", "캘린더"], ["reward", "🎁", "리워드"], ["style", "🎀", "스타일"]].map(([v, ic, lb]) => (
          <button key={v} className={"td-navbtn" + (view === v ? " on" : "")} onClick={() => setView(v)}><span>{ic}</span>{lb}</button>
        ))}
      </nav>
    </div>
  );
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Jua&family=Gowun+Dodum&display=swap');
.td-wrap{ --ink:#4A3F39; --muted:#B5A99E;
  --sp1:4px; --sp2:8px; --sp3:12px; --sp4:16px; --sp5:24px; --sp6:32px;
  --r-sm:12px; --r-md:20px; --r-pill:999px;
  --sh-soft:0 4px 16px var(--shadow); --sh-float:0 10px 30px var(--shadow);
  position:relative; font-family:'Gowun Dodum',system-ui,sans-serif; background:var(--pageBg,#FFF6EF); color:var(--ink); min-height:100vh; padding:14px 14px 96px; transition:background .4s,color .4s; -webkit-text-size-adjust:100%; -webkit-font-smoothing:antialiased; overflow-x:hidden; }
.td-wrap *{ box-sizing:border-box; }
.td-glow{ position:fixed; top:-15%; left:50%; transform:translateX(-50%); width:120%; height:44%; background:radial-gradient(ellipse at center, var(--glowc) 0%, transparent 70%); opacity:.7; pointer-events:none; z-index:0; transition:background .4s; }
.td-loading{ text-align:center; padding:80px 0; color:var(--muted); font-family:'Jua'; }
.td-app{ position:relative; z-index:1; width:100%; max-width:460px; margin:0 auto; }
.td-card{ background:var(--card); border-radius:var(--r-md); box-shadow:var(--sh-soft); margin-bottom:var(--sp3); }
.td-glasscard{ background:var(--glass); -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px); border:1px solid var(--line); }

.td-topbar{ display:flex; align-items:flex-start; justify-content:space-between; gap:var(--sp3); padding:2px 4px var(--sp4); }
.td-topbtns{ display:flex; gap:var(--sp2); align-items:center; flex-shrink:0; }
.td-pushmsg{ background:var(--card); border:1px solid var(--line); color:var(--ink); font-size:13px; text-align:center; padding:9px 12px; border-radius:var(--r-sm); margin-bottom:10px; cursor:pointer; box-shadow:var(--sh-soft); }
.td-savefail{ background:#FFF3F0; border:1.5px solid #F5C9BC; color:#C0553A; font-size:13px; text-align:center; padding:10px 12px; border-radius:var(--r-sm); margin-bottom:10px; cursor:pointer; font-family:'Gowun Dodum'; }
.td-onboard{ padding:var(--sp4); margin-bottom:var(--sp3); border:1.5px dashed var(--c1); }
.td-onboardhead{ font-family:'Jua'; font-size:15px; color:var(--c1); margin-bottom:var(--sp3); }
.td-onboardstep{ display:flex; gap:10px; align-items:flex-start; margin-bottom:var(--sp2); font-size:13px; line-height:1.5; color:var(--ink); }
.td-onboardstep > b{ flex-shrink:0; width:20px; height:20px; border-radius:50%; background:var(--soft); color:var(--c1); font-family:'Jua'; font-size:12px; display:flex; align-items:center; justify-content:center; }
.td-lighthint{ position:absolute; top:10px; left:14px; font-size:11px; color:var(--muted); }
.td-goalsec{ font-family:'Jua'; font-size:13px; color:var(--c1); margin:var(--sp4) 0 var(--sp2); padding-top:var(--sp3); border-top:1px solid var(--line); }
.td-weekrow{ display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--line); font-size:12.5px; color:var(--ink); flex-wrap:wrap; }
.td-weekrow:last-child{ border-bottom:none; }
.td-weeklb{ font-family:'Jua'; font-size:13px; flex:0 0 56px; }
.td-bonuschk{ display:block; width:100%; text-align:left; margin-top:8px; padding:10px 12px; border:1.5px solid var(--line); border-radius:var(--r-sm); background:var(--field); color:var(--ink); font-family:'Gowun Dodum'; font-size:13px; cursor:pointer; }
.td-bonuschk.on{ border-color:#3DAE7B; background:var(--good); }
.td-bdayveil{ position:fixed; inset:0; z-index:60; background:rgba(60,35,45,.45); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; padding:24px; animation:tdfade .5s ease; }
.td-bdaycard{ background:var(--card); border-radius:26px; padding:30px 24px; max-width:340px; width:100%; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,.3); }
.td-bdaycake{ font-size:56px; animation:tdbounce 1.6s ease-in-out infinite; }
.td-bdayconfetti{ font-size:18px; letter-spacing:6px; margin:6px 0 10px; }
.td-bdaycard h2{ font-family:'Jua'; font-size:22px; margin:4px 0 14px; color:var(--ink); }
.td-bdaymsg{ font-size:14px; line-height:1.75; color:var(--ink); margin:0 0 18px; }
.td-bdaydone{ font-family:'Jua'; font-size:15px; color:var(--c1); padding:12px; background:var(--soft); border-radius:var(--r-sm); }
@keyframes tdbounce{ 0%,100%{transform:translateY(0) rotate(-2deg);} 50%{transform:translateY(-8px) rotate(2deg);} }
@keyframes tdfade{ from{opacity:0;} to{opacity:1;} }
.td-zeropraise{ margin-top:8px; padding:9px 12px; border-radius:var(--r-sm); background:var(--good); color:#3DAE7B; font-size:12.5px; font-family:'Gowun Dodum'; }
.td-hello{ font-family:'Jua'; font-size:20px; color:var(--ink); letter-spacing:-.5px; line-height:1.3; min-width:0; overflow:hidden; }
.td-hello small{ display:block; font-family:'Gowun Dodum'; font-size:12px; color:var(--muted); margin-top:3px; font-weight:400; white-space:nowrap; }
.td-nightbtn{ width:36px; height:36px; border:none; border-radius:50%; background:var(--card); box-shadow:var(--sh-soft); font-size:15px; cursor:pointer; flex-shrink:0; }

.td-login{ width:100%; max-width:360px; margin:6vh auto 0; text-align:center; position:relative; z-index:1; }
.td-loginbuddy{ width:96px; height:96px; margin:0 auto var(--sp3); border-radius:50%; background:radial-gradient(circle at 50% 38%, var(--soft), transparent 70%); display:flex; align-items:center; justify-content:center; padding:14px; }
.td-login h1{ font-family:'Jua'; font-size:26px; margin:0 0 6px; letter-spacing:-.5px; }
.td-login p{ font-size:13.5px; color:var(--muted); margin:0 0 var(--sp5); line-height:1.5; }
.td-whopick{ display:flex; align-items:center; gap:7px; margin:var(--sp3) 0; flex-wrap:wrap; justify-content:center; font-size:14px; color:var(--muted); }
.td-whobtn{ border:2px solid var(--soft); background:var(--card); color:var(--ink); font-family:'Jua'; font-size:14px; padding:8px 14px; border-radius:var(--r-pill); cursor:pointer; }
.td-whobtn.on{ background:var(--tc); border-color:var(--tc); color:#fff; }
.td-loginbtn{ width:100%; margin-top:var(--sp1); padding:15px; border:none; border-radius:var(--r-sm); background:var(--c1); color:#fff; font-family:'Jua'; font-size:17px; cursor:pointer; box-shadow:0 6px 16px color-mix(in srgb, var(--c1) 32%, transparent); transition:transform .1s; }
.td-loginbtn:active{ transform:scale(.98); }
.td-loginhint{ display:block; margin-top:var(--sp3); color:var(--muted); font-size:12.5px; }
.td-install{ display:flex; align-items:center; justify-content:space-between; gap:8px; max-width:360px; margin:10px auto 0; background:var(--card); border-radius:var(--r-sm); padding:10px 14px; box-shadow:var(--sh-soft); position:relative; z-index:2; }
.td-installtxt{ font-size:12.5px; color:var(--ink); line-height:1.4; }
.td-installbtns{ display:flex; align-items:center; gap:6px; flex-shrink:0; }
.td-installadd{ border:none; background:var(--c1); color:#fff; font-family:'Jua'; font-size:13px; padding:6px 14px; border-radius:10px; cursor:pointer; }
.td-installx{ border:none; background:transparent; color:var(--muted); font-size:15px; cursor:pointer; padding:4px; }
.td-loginor{ display:flex; align-items:center; gap:10px; margin:var(--sp5) 0 var(--sp3); color:var(--muted); font-size:12px; }
.td-loginor:before, .td-loginor:after{ content:""; flex:1; height:1px; background:var(--line); }
.td-googlebtn{ width:100%; padding:13px; border:1.5px solid var(--line); border-radius:var(--r-sm); background:var(--card); color:var(--ink); font-family:'Gowun Dodum'; font-size:14.5px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:9px; margin-bottom:var(--sp2); }

.td-quotecard{ display:flex; align-items:flex-start; gap:9px; background:var(--glass); -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px); border:1px solid var(--line); border-radius:16px; padding:12px 14px; margin-bottom:12px; }
.td-quoteicon{ font-size:16px; flex:0 0 auto; margin-top:1px; }
.td-quotetext{ margin:0; font-size:13px; line-height:1.5; color:var(--ink); }
.td-tabs{ display:flex; gap:var(--sp1); margin-bottom:var(--sp3); padding:5px; border-radius:var(--r-pill); }
.td-tab{ flex:1; min-width:0; border:none; background:transparent; color:var(--ink); font-family:'Jua'; font-size:14px; padding:10px 6px; border-radius:var(--r-pill); cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; opacity:.55; transition:.2s; }
.td-tab span{ font-size:15px; } .td-tab.on{ background:var(--tc); color:#fff; opacity:1; box-shadow:0 4px 12px color-mix(in srgb, var(--tc) 30%, transparent); }

.td-datenav{ display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:12px; }
.td-datenav button{ width:34px; height:34px; flex:0 0 auto; border-radius:50%; border:none; background:var(--card); font-size:19px; cursor:pointer; color:var(--ink); box-shadow:0 3px 8px var(--shadow); }
.td-datenav button:disabled{ opacity:.35; }
.td-date{ text-align:center; } .td-date b{ font-family:'Jua'; font-size:20px; display:block; line-height:1.15; } .td-date small{ font-size:12px; color:var(--muted); display:block; }

.td-hero{ padding:var(--sp4); margin-bottom:var(--sp3); position:relative; }
.td-buddywrap{ display:flex; flex-direction:column; align-items:center; gap:4px; margin-bottom:12px; }
.td-buddy{ position:relative; width:88px; height:88px; border-radius:50%; background:var(--sky); display:flex; align-items:center; justify-content:center; padding:9px; overflow:visible; }
.td-buddy img,.td-buddy svg{ border-radius:50%; }
.td-buddy.lvl2{ box-shadow:0 0 0 3px rgba(255,255,255,.5),0 0 18px var(--c1); }
.td-buddy.lvl3{ box-shadow:0 0 0 3px #FFE08A,0 0 26px var(--c1); }
.td-spark{ position:absolute; font-size:15px; animation:twinkle 1.8s ease-in-out infinite; }
.td-spark.s1{ top:-4px; right:-2px; } .td-spark.s2{ bottom:2px; left:-6px; animation-delay:.5s; } .td-spark.s3{ top:6px; left:-4px; animation-delay:.9s; }
.td-name{ font-family:'Jua'; font-size:21px; display:flex; align-items:center; gap:7px; color:var(--ink); }
.td-badge{ font-family:'Jua'; font-size:11px; background:var(--c1); color:#fff; padding:3px 9px; border-radius:999px; }
.td-streak{ font-size:13px; color:var(--muted); }
.td-nudge{ background:var(--soft2); border:1px dashed var(--c1); color:var(--c2); font-family:'Jua'; font-size:13px; text-align:center; padding:8px; border-radius:12px; margin-bottom:10px; }
.td-sleepcard{ background:var(--soft2); border-radius:16px; padding:14px; }
.td-sleephead{ display:flex; align-items:baseline; justify-content:space-between; margin-bottom:10px; }
.td-sleephead span{ font-family:'Jua'; font-size:16px; } .td-sleephead b{ font-family:'Jua'; font-size:22px; color:var(--c2); }
.td-times{ display:flex; gap:8px; }
.td-times label{ flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted); }
.td-times input{ width:100%; border:2px solid var(--soft); border-radius:11px; padding:9px 6px; font-family:'Gowun Dodum'; font-size:15px; color:var(--ink); background:var(--field); }
.td-charge{ height:14px; background:var(--soft); border-radius:999px; margin-top:11px; overflow:hidden; }
.td-chargefill{ position:relative; height:100%; background:linear-gradient(90deg,var(--c1),var(--c2)); border-radius:999px; transition:width .5s; overflow:hidden; }
.td-shimmer{ position:absolute; inset:0; background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.5) 50%,transparent 70%); transform:translateX(-100%); animation:shimmer 2.4s ease-in-out infinite; }
.td-moodmsg{ font-family:'Jua'; font-size:14px; margin-top:9px; text-align:center; color:var(--ink); }
.td-reg{ display:flex; align-items:center; gap:8px; margin-top:12px; padding-top:11px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); flex-wrap:wrap; }
.td-reg b{ font-family:'Jua'; font-size:13px; } .td-regdots{ display:flex; gap:3px; } .td-regdots i{ width:9px; height:9px; border-radius:50%; }
.td-goalhint{ font-size:12px; color:var(--muted); margin-top:8px; text-align:center; }

.td-progress{ display:flex; gap:10px; margin-bottom:12px; }
.td-progitem{ flex:1; padding:12px 13px; }
.td-proglabel{ font-family:'Jua'; font-size:13px; margin-bottom:8px; color:var(--ink); }
.td-progdots{ display:flex; gap:4px; } .td-progdots i{ flex:1; height:8px; border-radius:4px; }
.td-progbar{ height:8px; background:var(--soft); border-radius:4px; overflow:hidden; } .td-progfill{ height:100%; background:linear-gradient(90deg,var(--c1),var(--c2)); border-radius:4px; transition:width .5s; }

.td-maincard{ padding:var(--sp4); }
.td-block{ margin-bottom:16px; } .td-block:last-of-type{ margin-bottom:8px; }
.td-blabel{ font-family:'Jua'; font-size:15px; margin-bottom:8px; color:var(--ink); }
.td-toggle{ width:100%; padding:13px; border:2px dashed var(--soft); border-radius:13px; background:var(--field); font-family:'Jua'; font-size:15px; color:var(--muted); cursor:pointer; transition:.15s; }
.td-toggle.on{ background:var(--c1); border-style:solid; border-color:var(--c1); color:#fff; animation:pop .35s ease; }
.td-input{ width:100%; margin-top:9px; padding:13px 15px; border:1.5px solid var(--line); border-radius:var(--r-sm); font-family:'Gowun Dodum'; font-size:15px; background:var(--field); color:var(--ink); outline:none; transition:border-color .2s; }
.td-input:focus{ border-color:var(--c1); }
.td-input::placeholder,.td-area::placeholder{ color:var(--muted); opacity:.7; }
.td-chips{ display:flex; gap:6px; }
.td-chip{ flex:1; min-width:0; padding:10px 0; border:2px solid var(--soft); border-radius:11px; background:var(--field); font-family:'Jua'; font-size:13px; color:var(--ink); cursor:pointer; }
.td-chip.on{ background:var(--c1); border-color:var(--c1); color:#fff; animation:pop .3s ease; }
.td-meals .td-mealrow{ display:flex; align-items:center; gap:9px; margin-top:8px; } .td-meals .td-mealrow:first-of-type{ margin-top:0; }
.td-meals .td-mealrow span{ font-family:'Jua'; font-size:13px; width:52px; flex:0 0 auto; color:var(--ink); }
.td-mealinput{ margin-top:0; }
.td-gratblock{ background:var(--grat); border:2px solid var(--gratline); border-radius:15px; padding:13px; }
.td-gratlabel{ color:var(--grattxt); } .td-gratinput{ margin-top:8px; } .td-gratinput:first-of-type{ margin-top:0; }
.td-area{ width:100%; padding:11px 13px; border:1.5px solid var(--line); border-radius:var(--r-sm); font-family:'Gowun Dodum'; font-size:15px; resize:vertical; background:var(--field); color:var(--ink); box-sizing:border-box; outline:none; transition:border-color .2s; }
.td-area:focus{ border-color:var(--c1); }
.td-cheerrow{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:4px; }
.td-cheercount{ font-family:'Jua'; font-size:13px; color:var(--c2); }
.td-cheerbtn{ position:relative; margin-left:auto; border:2px solid var(--c1); color:var(--c2); background:var(--card); padding:10px 16px; border-radius:999px; font-family:'Jua'; font-size:14px; cursor:pointer; display:flex; align-items:center; gap:8px; overflow:visible; }
.td-cheerbtn:active{ transform:scale(.95); }
.td-ball{ position:relative; width:20px; height:20px; border-radius:50%; overflow:hidden; display:inline-block; border:2px solid #2b2b2b; flex:0 0 auto; background:#fff; }
.td-balltop{ position:absolute; inset:0 0 50% 0; background:var(--bt); }
.td-ballband{ position:absolute; top:50%; left:0; right:0; height:3px; transform:translateY(-50%); background:#2b2b2b; }
.td-ballbtn{ position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:9px; height:9px; background:#fff; border:1.5px solid #2b2b2b; border-radius:50%; font-size:6px; line-height:7px; text-align:center; color:#ff5c8a; }
.td-burst{ position:absolute; top:50%; left:50%; pointer-events:none; }
.td-burst b{ position:absolute; color:var(--c1); font-size:14px; animation:floatup .9s ease-out forwards; animation-delay:var(--dl); transform:translate(-50%,-50%); }

.td-goalbtn{ width:100%; margin-top:var(--sp3); padding:12px; border:none; font-family:'Jua'; font-size:14px; color:var(--c1); cursor:pointer; }
.td-goalpanel{ padding:var(--sp4); margin-top:var(--sp2); }
.td-goalrow{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; } .td-goalrow:last-child{ margin-bottom:0; }
.td-goalrow label{ font-size:14px; color:var(--ink); flex:0 0 auto; }
.td-goalrow input{ border:2px solid var(--soft); border-radius:10px; padding:8px 10px; font-family:'Gowun Dodum'; font-size:15px; width:110px; text-align:center; background:var(--field); color:var(--ink); }
.td-goaldays{ align-items:flex-start; flex-direction:column; }
.td-daychips{ display:flex; gap:5px; width:100%; }
.td-daychip{ flex:1; padding:7px 0; border:2px solid var(--soft); border-radius:9px; background:var(--field); font-family:'Jua'; font-size:12px; cursor:pointer; color:var(--ink); }
.td-daychip.on{ background:var(--c1); border-color:var(--c1); color:#fff; }

.td-review{ padding:var(--sp4); margin-bottom:var(--sp3); }
.td-review h3{ font-family:'Jua'; font-size:15px; margin:0 0 12px; color:var(--ink); }
.td-reviewempty{ color:var(--muted); font-size:14px; text-align:center; margin:8px 0; }
.td-reviewgrid{ display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-bottom:12px; }
.td-rv{ background:var(--soft2); border-radius:12px; padding:10px 12px; }
.td-rv span{ display:block; font-size:12px; color:var(--muted); margin-bottom:3px; } .td-rv b{ font-family:'Jua'; font-size:14px; color:var(--ink); }
.td-fbgood{ background:var(--good); border-radius:11px; padding:10px 12px; font-size:13px; margin-bottom:7px; color:var(--ink); }
.td-fbtip{ background:var(--grat); border-radius:11px; padding:10px 12px; font-size:13px; color:var(--ink); }

.td-week{ padding:16px; }
.td-week h3{ font-family:'Jua'; font-size:15px; margin:0 0 14px; color:var(--ink); }
.td-bars{ display:flex; gap:5px; align-items:flex-end; }
.td-daycol{ flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; gap:6px; background:none; border:none; cursor:pointer; padding:5px 1px; border-radius:9px; }
.td-daycol.sel{ background:var(--soft); }
.td-barpair{ display:flex; gap:3px; align-items:flex-end; height:60px; }
.td-bar{ width:8px; border-radius:5px 5px 0 0; min-height:4px; transition:height .4s; }
.td-daylab{ font-size:10px; color:var(--muted); font-family:'Jua'; }
.td-legend{ display:flex; gap:16px; justify-content:center; margin-top:12px; font-size:12px; color:var(--muted); font-family:'Jua'; }
.td-legend span{ display:flex; align-items:center; gap:5px; } .td-legend i{ width:11px; height:11px; border-radius:4px; }

.td-month{ padding:var(--sp4); }
.td-monthhead{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.td-monthhead h3{ font-family:'Jua'; font-size:15px; margin:0; color:var(--ink); }
.td-monthhead button{ width:30px; height:30px; border:none; border-radius:50%; background:var(--soft2); font-size:17px; cursor:pointer; color:var(--ink); }
.td-monthdow{ display:grid; grid-template-columns:repeat(7,1fr); margin-bottom:6px; }
.td-monthdow span{ text-align:center; font-size:11px; color:var(--muted); font-family:'Jua'; }
.td-monthgrid{ display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
.td-mcell{ position:relative; aspect-ratio:1; border:none; border-radius:9px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; background:transparent; }
.td-mcell.empty{ cursor:default; } .td-mcell.sel{ outline:2px solid var(--c1); }
.td-mnum{ font-size:12px; color:var(--ink); font-family:'Gowun Dodum'; }
.td-mdot{ position:absolute; bottom:4px; width:5px; height:5px; border-radius:50%; }
.td-mlegend{ display:flex; gap:14px; justify-content:center; margin-top:12px; font-size:11px; color:var(--muted); font-family:'Jua'; }
.td-mlegend span{ display:flex; align-items:center; gap:5px; } .td-mlegend i{ width:12px; height:12px; border-radius:4px; } .td-mlegend i.dot{ width:7px; height:7px; border-radius:50%; }

.td-debt{ font-size:13px; color:var(--muted); margin-top:9px; text-align:center; } .td-debt b{ font-family:'Jua'; }
.td-moodchip{ font-size:19px; padding:8px 0; }
.td-couple{ padding:var(--sp4); margin-bottom:var(--sp3); }
.td-couple h3{ font-family:'Jua'; font-size:15px; margin:0 0 10px; color:var(--ink); }
.td-couplerow{ display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-bottom:10px; }
.td-couplemsg{ font-family:'Jua'; font-size:13px; color:var(--c1); text-align:center; margin:0; }
.td-savebar{ display:flex; align-items:center; gap:10px; margin-top:10px; }
.td-savebtn{ flex:1; padding:12px; border:none; border-radius:13px; background:var(--soft2); color:var(--c2); font-family:'Jua'; font-size:14px; cursor:pointer; }
.td-savebtn:active{ transform:scale(.98); }
.td-savedok{ font-family:'Jua'; font-size:13px; color:#3DAE7B; animation:pop .3s ease; }
.td-monthreport{ padding:var(--sp4); margin-top:var(--sp3); }
.td-monthreport h3{ font-family:'Jua'; font-size:15px; margin:0 0 12px; color:var(--ink); }
.td-viewonly{ text-align:center; font-family:'Jua'; font-size:12px; color:var(--muted); background:var(--glass); border:1px dashed var(--line); border-radius:12px; padding:8px; margin-bottom:10px; }
.td-gototoday{ display:block; width:fit-content; margin:6px auto 0; border:none; background:var(--soft); color:var(--c2); font-family:'Jua'; font-size:11px; padding:4px 14px; border-radius:999px; cursor:pointer; white-space:nowrap; }
.td-yesterday{ width:100%; margin-top:9px; padding:9px; border:1px dashed var(--soft); border-radius:11px; background:transparent; color:var(--muted); font-family:'Jua'; font-size:13px; cursor:pointer; }
.td-bhead{ width:100%; display:flex; align-items:center; gap:8px; background:none; border:none; padding:0; cursor:pointer; text-align:left; }
.td-blabel2{ font-family:'Jua'; font-size:15px; color:var(--ink); }
.td-bsum{ margin-left:auto; font-size:12px; color:var(--muted); max-width:56%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.td-bsum.ok{ color:var(--c2); font-family:'Jua'; }
.td-bcaret{ font-style:normal; color:var(--muted); font-size:11px; flex:0 0 auto; }
.td-bbody{ margin-top:9px; }
.td-maincard input:disabled,.td-maincard textarea:disabled,.td-times input:disabled,.td-goalrow input:disabled{ opacity:.95; }
.td-toggle:disabled,.td-chip:disabled,.td-daychip:disabled{ cursor:default; }
.td-milebadge{ display:flex; align-items:center; gap:4px; background:var(--soft); border-radius:var(--r-pill); padding:8px 13px; font-family:'Jua'; font-size:13px; color:var(--c1); box-shadow:none; cursor:pointer; }
.td-mileherocard{ padding:18px 16px 14px; margin-bottom:12px; }
.td-milerow{ display:flex; align-items:center; justify-content:center; gap:10px; }
.td-milecol{ flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; background:var(--soft2); border-radius:16px; padding:13px 8px; }
.td-milecol.td-sub{ opacity:.88; }
.td-mileemoji{ font-size:24px; }
.td-milename{ font-family:'Jua'; font-size:12px; color:var(--muted); }
.td-milenum{ font-family:'Jua'; font-size:28px; color:var(--mc); line-height:1.1; }
.td-milenum i{ font-size:14px; font-style:normal; margin-left:2px; }
.td-milediv{ font-size:20px; flex:0 0 auto; }
.td-milegoal{ margin-top:13px; }
.td-milegoalbar{ height:10px; background:var(--soft); border-radius:999px; overflow:hidden; margin-bottom:7px; }
.td-milegoalbar div{ height:100%; background:linear-gradient(90deg,var(--c1),var(--c2)); border-radius:999px; transition:width .5s; }
.td-milegoal span{ display:block; text-align:center; font-size:12px; color:var(--muted); }
.td-milegoal b{ color:var(--c2); font-family:'Jua'; }
.td-milesub{ text-align:center; font-size:11px; color:var(--muted); margin:8px 0 0; font-family:'Jua'; }
.td-rewardh3{ font-family:'Jua'; font-size:15px; margin:0 0 12px; color:var(--ink); }
.td-incoming{ padding:16px; margin-bottom:12px; border:2px dashed var(--c1); }
.td-shopcard{ padding:var(--sp4); margin-bottom:var(--sp3); }
.td-shophead{ display:flex; align-items:center; justify-content:space-between; }
.td-shophead .td-rewardh3{ margin:0; }
.td-editbtn{ border:none; background:var(--soft2); color:var(--muted); font-family:'Jua'; font-size:12px; padding:6px 13px; border-radius:999px; cursor:pointer; }
.td-seedbox{ text-align:center; padding:18px 0 10px; }
.td-seedemoji{ font-size:42px; display:block; margin-bottom:6px; }
.td-seedbox p{ color:var(--muted); font-size:13px; margin:0 0 12px; }
.td-seedbtn{ border:none; background:linear-gradient(90deg,var(--c1),var(--c2)); color:#fff; font-family:'Jua'; font-size:14px; padding:12px 20px; border-radius:999px; cursor:pointer; box-shadow:0 4px 12px var(--shadow); }
.td-rgrid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px; }
.td-rcard{ position:relative; display:flex; flex-direction:column; align-items:center; gap:5px; border-radius:18px; padding:16px 10px 12px; text-align:center; box-shadow:0 3px 10px var(--shadow); color:#4A4038; }
.td-rcard.t1{ background:linear-gradient(160deg,#EAF7EE,#D6EFDD); }
.td-rcard.t2{ background:linear-gradient(160deg,#FFF3DC,#FFE6BD); }
.td-rcard.t3{ background:linear-gradient(160deg,#FFE3EC,#F1D7FF); }
.td-rcard.locked .td-remoji{ filter:grayscale(.55); opacity:.75; }
.td-remoji{ font-size:34px; line-height:1; }
.td-rtitle{ font-family:'Jua'; font-size:13px; line-height:1.25; min-height:33px; display:flex; align-items:center; justify-content:center; }
.td-rprice{ font-family:'Jua'; font-size:12px; color:#8A7A66; background:rgba(255,255,255,.7); padding:3px 10px; border-radius:999px; }
.td-rbtn{ width:100%; margin-top:5px; border:none; border-radius:11px; padding:9px 0; font-family:'Jua'; font-size:12px; color:#fff; cursor:pointer; }
.t1 .td-rbtn{ background:#3DAE7B; } .t2 .td-rbtn{ background:#E0A23B; } .t3 .td-rbtn{ background:#E4568C; }
.td-rbtn.lock{ background:rgba(255,255,255,.75); color:#9A8B7C; cursor:default; }
.td-rbtn:active:not(.lock){ transform:scale(.97); }
.td-rdel{ position:absolute; top:7px; right:7px; width:22px; height:22px; border:none; border-radius:50%; background:rgba(0,0,0,.4); color:#fff; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:2; }
.td-addtoggle{ width:100%; margin-top:12px; padding:11px; border:2px dashed var(--soft); border-radius:13px; background:transparent; color:var(--c2); font-family:'Jua'; font-size:13px; cursor:pointer; }
.td-addpanel{ margin-top:10px; background:var(--soft2); border-radius:14px; padding:12px; }
.td-emojirow{ display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
.td-emojichip{ width:37px; height:37px; border:2px solid transparent; border-radius:10px; background:var(--field); font-size:17px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; }
.td-emojichip.on{ border-color:var(--c1); background:var(--card); }
.td-addrow{ display:flex; gap:7px; }
.td-addrow .td-addtitle{ flex:2; margin-top:0; }
.td-addrow .td-addcost{ flex:1; margin-top:0; }
.td-addbtn2{ width:100%; margin-top:9px; border:none; background:var(--c2); color:#fff; font-family:'Jua'; font-size:14px; padding:11px; border-radius:12px; cursor:pointer; }
.td-ticket{ display:flex; align-items:center; gap:10px; background:var(--soft2); border-radius:14px; padding:11px 13px; margin-bottom:8px; }
.td-ticket:last-child{ margin-bottom:0; }
.td-ticket.done{ opacity:.55; }
.td-ticketicon{ font-size:22px; padding-right:10px; border-right:2px dashed var(--line); }
.td-ticketbody{ flex:1; display:flex; flex-direction:column; }
.td-ticketbody b{ font-family:'Jua'; font-size:14px; color:var(--ink); }
.td-ticketbody small{ font-size:11px; color:var(--muted); margin-top:1px; }
.td-ticketbtn{ border:none; background:var(--c1); color:#fff; font-family:'Jua'; font-size:12px; padding:9px 13px; border-radius:999px; cursor:pointer; }
.td-ledgerrow{ display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--line); font-size:13px; color:var(--ink); }
.td-ledgerrow:last-of-type{ border-bottom:none; }
.td-ledgerdate{ font-size:11px; color:var(--muted); width:40px; flex:0 0 auto; font-family:'Jua'; }
.td-ledgerlabel{ flex:1; }
.td-ledgerrow .plus{ color:#3DAE7B; font-family:'Jua'; } .td-ledgerrow .minus{ color:#DC6B57; font-family:'Jua'; }
.td-autogrow{ resize:none; overflow:hidden; min-height:44px; line-height:1.45; white-space:pre-wrap; word-break:break-word; font-family:'Gowun Dodum'; field-sizing:content; box-sizing:border-box; }
.td-hero{ position:relative; }
.td-ring{ position:absolute; top:14px; right:14px; width:46px; height:46px; }
.td-bigsleep{ font-size:27px !important; font-variant-numeric:tabular-nums; }
.td-statstrip{ display:flex; gap:var(--sp1); padding:var(--sp3) 10px; margin-bottom:var(--sp3); }
.td-stat{ flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; gap:6px; }
.td-stat > span{ font-size:11px; color:var(--muted); font-family:'Jua'; }
.td-stat b{ font-family:'Jua'; font-size:12px; color:var(--ink); text-align:center; }
.td-stat .td-progdots{ width:100%; max-width:72px; }
.td-stat .td-progbar{ width:100%; max-width:72px; }
.td-headline{ font-family:'Jua'; font-size:17px; line-height:1.45; color:var(--ink); margin:0 0 12px; }
.td-presence{ display:block; font-size:11px; color:var(--muted); margin-top:3px; }
.td-milebadge,.td-milenum{ font-variant-numeric:tabular-nums; }
.td-buddy.done{ box-shadow:0 0 0 3px #FFE08A, 0 0 24px var(--c1); }
.td-week{ margin-bottom:12px; }
.td-bigceleb{ position:fixed; inset:0; z-index:60; background:rgba(18,14,28,.6); -webkit-backdrop-filter:blur(9px); backdrop-filter:blur(9px); display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; animation:fadein .35s ease; overflow:hidden; }
.td-bigrays{ position:absolute; width:360px; height:360px; border-radius:50%; background:repeating-conic-gradient(rgba(255,224,138,.16) 0 14deg, transparent 14deg 28deg); animation:spinslow 16s linear infinite; }
.td-bigbuddy{ position:relative; z-index:1; width:132px; height:132px; border-radius:50%; background:var(--sky); padding:14px; overflow:hidden; box-shadow:0 0 0 5px rgba(255,255,255,.35), 0 12px 44px rgba(0,0,0,.4); animation:pop .5s ease; }
.td-bigceleb h2{ position:relative; z-index:1; font-family:'Jua'; color:#fff; font-size:24px; margin:16px 0 4px; text-align:center; padding:0 20px; }
.td-bigceleb p{ position:relative; z-index:1; color:rgba(255,255,255,.85); font-size:14px; margin:0; text-align:center; padding:0 20px; }
.td-bigclose{ position:relative; z-index:1; margin-top:18px; color:rgba(255,255,255,.55); font-size:12px; }
@keyframes spinslow{ to{ transform:rotate(360deg); } }
@keyframes fadein{ from{ opacity:0; } to{ opacity:1; } }
/* 아바타 데코 */
.td-avatar{ position:relative; display:inline-flex; align-items:center; justify-content:center; }
.td-avatarinner{ position:relative; z-index:1; border-radius:50%; }
.td-hat{ position:absolute; top:-14px; left:50%; transform:translateX(-50%) rotate(-8deg); font-size:26px; z-index:3; filter:drop-shadow(0 2px 3px rgba(0,0,0,.25)); }
.td-avatar.big .td-hat{ font-size:30px; top:-16px; }
.td-aura{ position:absolute; inset:-10px; z-index:0; pointer-events:none; }
.td-aura span{ position:absolute; top:50%; left:50%; font-size:13px; transform-origin:0 0; animation:orbit 6s linear infinite; animation-delay:var(--dl); opacity:.9; }
@keyframes orbit{ from{ transform:rotate(calc(var(--i) * (360deg / var(--n)))) translateX(58px) rotate(0deg); } to{ transform:rotate(calc(var(--i) * (360deg / var(--n)) + 360deg)) translateX(58px) rotate(-360deg); } }
.td-avatar.big .td-aura span{ font-size:15px; }
.td-avatar.frame-gold .td-avatarinner{ box-shadow:0 0 0 4px #FFD874, 0 0 14px rgba(255,200,80,.6); }
.td-avatar.frame-rainbow .td-avatarinner{ box-shadow:0 0 0 4px transparent; background:linear-gradient(#fff,#fff) padding-box, conic-gradient(from 0deg,#FF8A80,#FFD180,#FFFF8D,#B9F6CA,#84FFFF,#B388FF,#FF8A80) border-box; border:4px solid transparent; }
.td-avatar.frame-neon .td-avatarinner{ box-shadow:0 0 0 3px #6EE7FF, 0 0 18px #6EE7FF; }
.td-avatar.frame-dashed .td-avatarinner{ box-shadow:0 0 0 3px var(--card); outline:3px dashed var(--c1); outline-offset:2px; }
/* 커플 질문 */
.td-qcard{ padding:var(--sp4); margin-bottom:var(--sp3); }
.td-qhead{ font-family:'Jua'; font-size:14px; color:var(--c1); margin-bottom:var(--sp2); }
.td-qtext{ font-family:'Gowun Dodum'; font-weight:700; font-size:15.5px; line-height:1.5; margin:0 0 var(--sp3); color:var(--ink); }
.td-qanswer{ display:flex; gap:7px; } .td-qanswer .td-input{ margin-top:0; }
.td-qbtn{ border:none; background:var(--c1); color:#fff; font-family:'Jua'; font-size:13px; padding:0 15px; border-radius:11px; cursor:pointer; white-space:nowrap; }
.td-qbubble{ display:flex; flex-direction:column; gap:3px; padding:11px 14px; border-radius:14px; margin-bottom:var(--sp2); }
.td-qbubble b{ font-family:'Jua'; font-size:11px; color:var(--muted); } .td-qbubble span{ font-size:13.5px; line-height:1.45; color:var(--ink); }
.td-qbubble.me{ background:var(--soft); } .td-qbubble.partner{ background:var(--soft2); border:1px solid var(--line); }
.td-qwait{ text-align:center; font-size:13px; color:var(--muted); padding:8px; }
/* 쪽지 배너 */
.td-letterbanner{ display:flex; align-items:center; gap:12px; padding:14px; margin-bottom:12px; border:none; width:100%; cursor:pointer; text-align:left; background:linear-gradient(120deg,var(--grat),var(--soft2)); animation:letterpulse 2s ease-in-out infinite; }
.td-lettericon{ font-size:30px; } .td-letterbanner b{ font-family:'Jua'; font-size:14px; color:var(--ink); display:block; } .td-letterbanner small{ font-size:11px; color:var(--muted); }
@keyframes letterpulse{ 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.015); } }
/* 응원 피드/박스 */
.td-cheerfeed{ padding:12px 14px; margin-bottom:12px; }
.td-cheernote{ font-size:13px; color:var(--ink); padding:5px 0; }
.td-cheerbox{ margin-top:12px; background:var(--soft2); border-radius:14px; padding:12px; }
.td-cheerpresets{ display:flex; flex-wrap:wrap; gap:6px; margin-bottom:9px; }
.td-cheerpresets button{ border:1px solid var(--soft); background:var(--card); color:var(--ink); font-size:12px; padding:7px 11px; border-radius:999px; cursor:pointer; }
.td-cheercustom{ display:flex; gap:7px; } .td-cheercustom .td-input{ margin-top:0; }
.td-cheeronly{ width:100%; margin-top:9px; border:none; background:none; color:var(--muted); font-size:12px; text-decoration:underline; cursor:pointer; }
/* 마음 보내기 / 꾸미기 */
.td-lovecard,.td-decocard{ padding:16px; margin-bottom:12px; }
.td-lovebox{ display:flex; flex-direction:column; gap:6px; }
.td-loveemoji{ font-size:26px; } .td-lovebox b{ font-family:'Jua'; font-size:14px; color:var(--ink); } .td-lovebox small{ font-size:11px; color:var(--muted); }
.td-loverow{ display:flex; gap:7px; align-items:center; } .td-loverow .td-input{ margin-top:0; } .td-letterlabel{ font-size:12px; color:var(--muted); flex:0 0 auto; }
.td-letterwrite{ margin-top:14px; padding-top:14px; border-top:1px solid var(--line); }
.td-decopreview{ display:flex; justify-content:center; padding:16px 0 20px; }
.td-decogroup{ margin-bottom:12px; }
.td-decolabel{ display:block; font-family:'Jua'; font-size:12px; color:var(--muted); margin-bottom:7px; }
.td-decochips{ display:flex; flex-wrap:wrap; gap:7px; }
.td-decochip{ min-width:42px; height:42px; border:2px solid var(--soft); border-radius:12px; background:var(--field); font-size:19px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0 8px; }
.td-decochip.on{ border-color:var(--c1); background:var(--card); box-shadow:0 2px 8px var(--shadow); }
.td-framechip{ font-family:'Jua'; font-size:12px; color:var(--ink); }
.td-framechip.frame-gold{ box-shadow:inset 0 0 0 2px #FFD874; } .td-framechip.frame-rainbow{ background:linear-gradient(90deg,#FFE0E0,#E0F0FF); } .td-framechip.frame-neon{ box-shadow:inset 0 0 0 2px #6EE7FF; }
/* 쪽지 개봉 모달 */
.td-letteropen{ position:fixed; inset:0; z-index:60; background:rgba(18,14,28,.6); -webkit-backdrop-filter:blur(9px); backdrop-filter:blur(9px); display:flex; align-items:center; justify-content:center; padding:24px; animation:fadein .3s ease; }
.td-envelope{ background:var(--card); border-radius:22px; padding:24px 22px; max-width:340px; width:100%; text-align:center; box-shadow:0 16px 50px rgba(0,0,0,.4); animation:pop .45s ease; }
.td-envtop{ font-size:44px; animation:letterpulse 2s ease-in-out infinite; }
.td-envfrom{ font-family:'Jua'; font-size:13px; color:var(--muted); margin:8px 0 14px; }
.td-envmsg{ font-size:16px; line-height:1.6; color:var(--ink); margin:0 0 18px; white-space:pre-wrap; word-break:break-word; }
.td-envclose{ border:none; background:var(--c1); color:#fff; font-family:'Jua'; font-size:14px; padding:11px 28px; border-radius:999px; cursor:pointer; }
/* 스타일샵 */
.td-stylehero{ padding:var(--sp4); margin-bottom:var(--sp3); text-align:center; position:relative; }
.td-stylebal{ position:absolute; top:12px; right:14px; font-family:'Jua'; font-size:13px; color:var(--c1); background:var(--soft2); padding:6px 12px; border-radius:999px; font-variant-numeric:tabular-nums; }
.td-kissbal{ background:linear-gradient(90deg,#FFE0EC,#FFD0E4); color:#D6488A; }
.td-kisshint{ font-size:11px; color:var(--muted); text-align:center; margin:10px 8px 0; line-height:1.5; }
.td-stylepreview{ display:flex; justify-content:center; padding:20px 0 8px; }
.td-tryonbar{ display:flex; justify-content:center; gap:10px; align-items:center; font-family:'Jua'; font-size:12px; color:var(--c2); margin-top:8px; }
.td-tryonbar button{ border:none; background:none; color:var(--muted); text-decoration:underline; font-size:12px; cursor:pointer; }
.td-stylesubs{ display:flex; gap:var(--sp1); margin-top:var(--sp4); background:var(--soft2); border-radius:var(--r-sm); padding:5px; }
.td-stylesubs button{ flex:1; border:none; background:transparent; font-family:'Jua'; font-size:13px; padding:9px; border-radius:10px; color:var(--muted); cursor:pointer; }
.td-stylesubs button.on{ background:var(--card); color:var(--ink); box-shadow:0 2px 8px var(--shadow); }
.td-ownedcnt{ font-size:11px; color:var(--muted); font-family:'Gowun Dodum'; margin-left:6px; }
.td-closetrow{ margin-bottom:13px; } .td-closetrow:last-child{ margin-bottom:0; }
.td-closetempty{ font-size:12px; color:var(--muted); align-self:center; }
.td-decochip.tier2{ border-color:#B9E8CC; } .td-decochip.tier3{ border-color:#D9C8F5; } .td-decochip.tier4{ border-color:#FFD874; }
.td-shopfilter{ display:flex; gap:var(--sp2); overflow-x:auto; padding:2px 2px 10px; -webkit-overflow-scrolling:touch; scrollbar-width:none; }
.td-shopfilter::-webkit-scrollbar{ display:none; }
.td-shopfilter button{ flex:0 0 auto; border:none; background:var(--card); color:var(--muted); font-family:'Jua'; font-size:12px; padding:8px 13px; border-radius:999px; box-shadow:0 2px 6px var(--shadow); cursor:pointer; }
.td-shopfilter button.on{ background:var(--c1); color:#fff; }
.td-shopgrid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.td-shopitem{ position:relative; display:flex; flex-direction:column; align-items:center; gap:5px; border-radius:var(--r-md); padding:24px 10px 12px; background:var(--card); box-shadow:var(--sh-soft); border:1.5px solid var(--line); color:var(--ink); }
.td-shopitem.tier2{ border-color:#B9E8CC; background:linear-gradient(170deg,#FDFFFE,#EAF8EF); color:#4A4038; }
.td-shopitem.tier3{ border-color:#D9C8F5; background:linear-gradient(170deg,#FDFCFF,#F3EBFF); color:#4A4038; }
.td-shopitem.tier4{ border:2px solid #FFCE63; background:linear-gradient(135deg,#FFF6D8,#FFE0EE,#E4EFFF,#FFF6D8); background-size:300% 300%; animation:holoshine 5s ease infinite; color:#4A4038; box-shadow:0 6px 22px rgba(255,190,90,.4), 0 0 0 1px rgba(255,255,255,.6) inset; overflow:hidden; }
.td-shopitem.tier4::before{ content:"✦"; position:absolute; top:6px; right:9px; color:#F6C453; font-size:12px; animation:twinkle 1.6s ease-in-out infinite; }
.td-shopitem.tier4::after{ content:""; position:absolute; top:0; left:-60%; width:45%; height:100%; background:linear-gradient(105deg,transparent,rgba(255,255,255,.75),transparent); transform:skewX(-18deg); animation:cardsweep 3.4s ease-in-out infinite; }
@keyframes cardsweep{ 0%{ left:-60%; } 55%,100%{ left:130%; } }
.td-shopitem.tier3{ border:2px solid #D9C8F5; background:linear-gradient(160deg,#FBF7FF,#F0E6FF); box-shadow:0 5px 18px rgba(160,110,220,.28); color:#4A4038; }
@keyframes holoshine{ 0%,100%{ background-position:0% 0%; } 50%{ background-position:100% 100%; } }
.td-shopitem.trying{ outline:3px dashed var(--c1); outline-offset:2px; }
.td-tierbadge{ position:absolute; top:8px; left:8px; font-family:'Jua'; font-size:9px; padding:2px 7px; border-radius:999px; background:var(--soft2); color:var(--muted); }
.td-shopitem.tier2 .td-tierbadge{ background:#DFF3E6; color:#3DAE7B; }
.td-shopitem.tier3 .td-tierbadge{ background:#EDE3FB; color:#8E6BC7; }
.td-shopitem.tier4 .td-tierbadge{ background:linear-gradient(90deg,#FFE082,#FFC7E6,#FFE082); background-size:200% 100%; animation:holoshine 3s linear infinite; color:#9A6B00; font-weight:bold; box-shadow:0 1px 4px rgba(255,180,80,.5); }
.td-itempreview{ position:relative; width:64px; height:64px; background:none; border:none; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center; }
.td-thumb{ position:relative; width:60px; height:60px; display:flex; align-items:center; justify-content:center; }
.td-thumb .td-sv{ position:static !important; transform:none !important; width:80% !important; top:auto !important; left:auto !important; bottom:auto !important; }
.td-thumbbg{ width:52px; height:52px; border-radius:50%; box-shadow:inset 0 -4px 8px rgba(0,0,0,.08); }
.td-thumb .td-avatar{ transform:scale(.62); } .td-fprevdot{ width:56px; height:56px; border-radius:50%; background:var(--soft2); }
.td-thumbaura{ gap:3px; } .td-thumbaura i{ font-size:15px; font-style:normal; animation:twinkle 1.8s ease-in-out infinite; }
.td-thumbaura i:nth-child(2){ animation-delay:.3s; } .td-thumbaura i:nth-child(3){ animation-delay:.6s; }
.td-thumbemoji{ font-size:34px; }
.td-shopitem.tier3 .td-thumb, .td-shopitem.tier4 .td-thumb{ animation:thumbfloat 3s ease-in-out infinite; }
@keyframes thumbfloat{ 0%,100%{ transform:translateY(0); } 50%{ transform:translateY(-5px); } }
.td-shopitem.tier4 .td-thumb{ filter:drop-shadow(0 4px 10px rgba(255,180,80,.55)); }
.td-shopitem.tier3 .td-thumb{ filter:drop-shadow(0 3px 8px rgba(160,110,220,.4)); }
/* 착용 시 등급 글로우 */
.td-tg3{ filter:drop-shadow(0 0 5px rgba(180,120,240,.85)) drop-shadow(0 2px 3px rgba(0,0,0,.18)); }
.td-tg4{ filter:drop-shadow(0 0 7px #FFD874) drop-shadow(0 0 12px rgba(255,200,90,.6)) drop-shadow(0 2px 3px rgba(0,0,0,.18)); }
.td-itemname{ font-family:'Jua'; font-size:12.5px; text-align:center; min-height:32px; display:flex; align-items:center; color:inherit; }
.td-itemprice{ font-family:'Jua'; font-size:12px; color:#8A7A66; background:rgba(255,255,255,.65); padding:2px 9px; border-radius:999px; }
.td-itembtns{ display:flex; gap:5px; width:100%; margin-top:4px; }
.td-buybtn{ flex:1; border:none; border-radius:10px; padding:8px 0; font-family:'Jua'; font-size:12px; color:#fff; background:var(--c1); cursor:pointer; }
.td-buybtn:disabled{ background:var(--soft); color:var(--muted); cursor:default; }
.td-giftitembtn{ width:36px; border:none; border-radius:10px; background:#FFD6E8; font-size:14px; cursor:pointer; }
.td-giftitembtn:disabled{ opacity:.35; cursor:default; }
.td-ownedtag{ font-family:'Jua'; font-size:11px; color:#3DAE7B; padding:8px 0 2px; }
.td-shophint{ text-align:center; font-size:11px; color:var(--muted); margin:12px 0 0; }
/* 아이템 레이어 */
.td-sv{ position:absolute; z-index:4; pointer-events:none; filter:drop-shadow(0 2px 3px rgba(0,0,0,.18)); }
.td-itm{ position:absolute; z-index:4; pointer-events:none; filter:drop-shadow(0 2px 3px rgba(0,0,0,.18)); }
.td-itm-head{ top:-17%; left:50%; transform:translateX(-50%) rotate(-6deg); font-size:26px; }
.td-avatar.big .td-itm-head{ font-size:32px; }
.td-itm-prop{ bottom:-8%; right:-16%; font-size:24px; }
.td-avatar.big .td-itm-prop{ font-size:30px; }
.td-itm-face{ top:46%; left:50%; transform:translateX(-50%); font-size:16px; }
.td-itm-neck{ bottom:0%; left:50%; transform:translateX(-50%); font-size:18px; }
.td-cheekL{ top:56%; left:18%; font-size:11px; } .td-cheekR{ top:56%; right:18%; font-size:11px; }
.td-avatar.big .td-cheekL,.td-avatar.big .td-cheekR{ font-size:14px; }
.td-twk{ animation:twinkle 1.6s ease-in-out infinite; }
.td-beat{ animation:heartbeat 1.2s ease-in-out infinite; }
@keyframes heartbeat{ 0%,100%{ transform:scale(1); } 30%{ transform:scale(1.28); } }
.td-glow{ filter:drop-shadow(0 0 8px #FFC46B) drop-shadow(0 2px 3px rgba(0,0,0,.18)); }
.td-halofloat{ animation:halofloat 2.4s ease-in-out infinite; }
@keyframes halofloat{ 0%,100%{ transform:translateX(-50%) translateY(0); } 50%{ transform:translateX(-50%) translateY(-4px); } }
.td-hue{ animation:hueanim 5s linear infinite; }
@keyframes hueanim{ to{ filter:hue-rotate(360deg) drop-shadow(0 2px 3px rgba(0,0,0,.18)); } }
.td-aura.spd2 span{ animation-duration:3.2s; }
/* 배경 */
.td-abg{ position:absolute; inset:0; border-radius:50%; overflow:hidden; z-index:0; }
.td-abg span{ position:absolute; }
.td-avatar.hasbg .td-buddy{ background:transparent; position:relative; z-index:1; }
.abg-b_pastel{ background:linear-gradient(160deg,#FFE9F3,#E3F2FF); }
.abg-b_cloud{ background:linear-gradient(180deg,#BFE3FF,#EAF6FF); }
.abg-b_sunset{ background:linear-gradient(180deg,#FFB37A,#FF7FA2); }
.abg-b_sakura{ background:linear-gradient(180deg,#FFDDEB,#FFF0F6); }
.abg-b_night{ background:linear-gradient(180deg,#20224E,#3A2E63); }
.abg-b_aurora{ background:linear-gradient(120deg,#143054,#1E4D5C,#3C2A63,#143054); background-size:300% 300%; animation:aurorabg 8s ease infinite; }
@keyframes aurorabg{ 0%,100%{ background-position:0% 50%; } 50%{ background-position:100% 50%; } }
/* 프레임 */
.td-avatar.frame-fr_pink .td-avatarinner{ box-shadow:0 0 0 4px #FFC2D6; border-radius:50%; }
.td-avatar.frame-fr_mint .td-avatarinner{ box-shadow:0 0 0 4px #B9E8CC; border-radius:50%; }
.td-avatar.frame-fr_lav .td-avatarinner{ box-shadow:0 0 0 4px #D9C8F5; border-radius:50%; }
.td-avatar.frame-fr_gold .td-avatarinner{ box-shadow:0 0 0 4px #FFD874, 0 0 14px rgba(255,200,80,.55); border-radius:50%; }
.td-avatar.frame-fr_rose .td-avatarinner{ box-shadow:0 0 0 4px #F4B8A8, 0 0 12px rgba(244,150,130,.5); border-radius:50%; }
.td-avatar.frame-fr_lace .td-avatarinner{ outline:3px dashed #fff; outline-offset:3px; box-shadow:0 0 0 3px rgba(255,255,255,.6); border-radius:50%; }
.td-avatar.frame-fr_neon .td-avatarinner{ box-shadow:0 0 0 3px #6EE7FF, 0 0 18px #6EE7FF; border-radius:50%; }
.td-avatar.frame-fr_holo .td-avatarinner{ border:4px solid transparent; border-radius:50%; background:linear-gradient(var(--card),var(--card)) padding-box, conic-gradient(from 0deg,#FF8A80,#FFD180,#FFFF8D,#B9F6CA,#84FFFF,#B388FF,#FF8A80) border-box; }
/* 언박싱 */
.td-unboxbox{ position:relative; z-index:1; background:none; border:none; font-size:84px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:12px; animation:boxshake 1.1s ease-in-out infinite; }
.td-unboxbox span{ font-size:13px; color:rgba(255,255,255,.7); font-family:'Jua'; }
@keyframes boxshake{ 0%,100%{ transform:rotate(0); } 20%{ transform:rotate(-6deg) scale(1.03); } 40%{ transform:rotate(6deg); } 60%{ transform:rotate(-3deg); } 80%{ transform:rotate(3deg); } }
.td-unboxreveal{ position:relative; display:flex; flex-direction:column; align-items:center; z-index:1; animation:pop .5s ease; }
.td-unboxemoji{ font-size:72px; filter:drop-shadow(0 6px 18px rgba(255,255,255,.35)); }
.td-unboxreveal h2{ font-family:'Jua'; color:#fff; font-size:22px; margin:12px 0 4px; }
.td-unboxreveal p{ color:rgba(255,255,255,.85); margin:0; font-size:13px; }
.td-unboxnote{ margin-top:10px !important; font-size:14px !important; color:#FFE3EE !important; }
.td-unboxglow{ position:absolute; inset:-70px; border-radius:50%; background:radial-gradient(circle, rgba(255,255,255,.28), transparent 70%); z-index:-1; }
.td-unboxreveal.tier4 .td-unboxglow{ background:conic-gradient(#FF8A80,#FFD180,#FFFF8D,#B9F6CA,#84FFFF,#B388FF,#FF8A80); filter:blur(34px); opacity:.5; animation:spinslow 8s linear infinite; }
/* 가챠 */
.td-gachacard{ padding:20px 16px; margin-bottom:12px; text-align:center; }
.td-gachamachine{ width:96px; height:96px; margin:0 auto 4px; border-radius:26px; background:linear-gradient(160deg,#FFE3EF,#E6ECFF); display:flex; align-items:center; justify-content:center; box-shadow:inset 0 -6px 14px rgba(0,0,0,.06); }
.td-gachaball{ font-size:48px; animation:boxshake 1.3s ease-in-out infinite; }
.td-gachatitle{ font-family:'Jua'; font-size:17px; margin:10px 0 6px; color:var(--ink); }
.td-gachadesc{ font-size:12px; color:var(--muted); line-height:1.5; margin:0 8px 12px; } .td-gachadesc b{ color:var(--c2); }
.td-gacharates{ display:flex; flex-wrap:wrap; justify-content:center; gap:6px 12px; font-size:11px; color:var(--muted); font-family:'Jua'; margin-bottom:16px; }
.td-gachabtns{ display:flex; gap:10px; }
.td-gachabtn{ flex:1; display:flex; flex-direction:column; align-items:center; gap:2px; border:none; border-radius:16px; padding:14px 8px; background:var(--soft2); color:var(--ink); font-family:'Jua'; font-size:14px; cursor:pointer; }
.td-gachabtn b{ font-size:13px; color:var(--c2); }
.td-gachabtn small{ font-size:10px; color:var(--muted); }
.td-gachabtn.big{ background:linear-gradient(150deg,#FFE9A8,#FFD1E8); color:#9A5A2C; }
.td-gachabtn.big b{ color:#B8860B; }
.td-gachabtn:disabled{ opacity:.45; cursor:default; }
.td-gacharesult{ background:var(--card); border-radius:22px; padding:22px 18px; max-width:360px; width:100%; text-align:center; box-shadow:0 16px 50px rgba(0,0,0,.4); animation:pop .4s ease; max-height:80vh; overflow-y:auto; }
.td-gacharesult h2{ font-family:'Jua'; font-size:20px; color:var(--ink); margin:0 0 14px; }
.td-gachagrid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(72px,1fr)); gap:9px; margin-bottom:16px; }
.td-gachaitem{ position:relative; display:flex; flex-direction:column; align-items:center; gap:2px; border-radius:14px; padding:12px 6px 8px; background:var(--soft2); border:2px solid var(--line); }
.td-gachaitem.tier2{ border-color:#B9E8CC; } .td-gachaitem.tier3{ border-color:#D9C8F5; } .td-gachaitem.tier4{ border-color:#FFD874; background:linear-gradient(150deg,#FFF9E8,#FFEFF7); animation:pop .5s ease; }
.td-gachaitem.dupe{ opacity:.7; }
.td-gachaemoji{ font-size:30px; }
.td-gachaitem b{ font-family:'Jua'; font-size:11px; color:var(--ink); text-align:center; }
.td-gachaitem small{ font-size:9px; color:var(--muted); }
.td-jackpot{ position:absolute; top:-8px; right:-6px; background:#FFD874; color:#8A5A1C; font-family:'Jua'; font-size:9px; padding:2px 6px; border-radius:999px; transform:rotate(8deg); box-shadow:0 2px 6px rgba(0,0,0,.2); }
.td-spin{ animation:spinslow 4s linear infinite; }
.td-goalcol{ flex-direction:column; align-items:flex-start !important; gap:8px; }
.td-goalcol input{ width:100% !important; }
.td-charpick{ display:grid; grid-template-columns:repeat(4,1fr); gap:8px; width:100%; }
.td-charbtn{ display:flex; flex-direction:column; align-items:center; gap:3px; border:1.5px solid var(--line); border-radius:var(--r-sm); background:var(--field); padding:8px 4px 6px; cursor:pointer; }
.td-charbtn.on{ border-color:var(--c1); background:var(--card); box-shadow:0 3px 10px var(--shadow); }
.td-charprev{ width:44px; height:44px; display:block; }
.td-charbtn i{ font-style:normal; font-family:'Jua'; font-size:10px; color:var(--muted); }
.td-charbtn.on i{ color:var(--c2); }
.td-palpick{ display:flex; gap:9px; flex-wrap:wrap; }
.td-palbtn{ width:34px; height:34px; border-radius:50%; border:3px solid transparent; cursor:pointer; box-shadow:var(--sh-soft); }
.td-palbtn.on{ border-color:var(--card); outline:2.5px solid var(--c2); }
.td-foot{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:16px; font-size:12px; color:var(--muted); }
.td-foot button{ border:none; background:none; color:var(--muted); text-decoration:underline; cursor:pointer; font-size:12px; font-family:inherit; }

.td-bottomnav{ position:fixed; left:50%; transform:translateX(-50%); bottom:12px; z-index:20; width:calc(100% - 24px); max-width:436px; display:flex; gap:var(--sp1); padding:6px; border-radius:var(--r-pill); background:var(--card); box-shadow:var(--sh-float); }
.td-navbtn{ flex:1; border:none; background:transparent; color:var(--muted); font-family:'Gowun Dodum'; font-size:10.5px; padding:8px 0; border-radius:var(--r-pill); cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:3px; transition:.2s; }
.td-navbtn span{ font-size:18px; } .td-navbtn.on{ background:var(--c1); color:#fff; }

.td-confetti{ position:fixed; inset:0; pointer-events:none; z-index:40; overflow:hidden; }
.td-confetti b{ position:absolute; top:-20px; left:var(--l); width:9px; height:14px; border-radius:2px; transform:rotate(var(--rot)); animation:fall 2.1s ease-in forwards; animation-delay:var(--dl); }
.td-celebmsg{ position:absolute; top:38%; left:50%; transform:translate(-50%,-50%); background:var(--card); color:var(--ink); font-family:'Jua'; font-size:17px; padding:14px 22px; border-radius:16px; box-shadow:0 8px 24px var(--shadow); animation:pop .4s ease; }

@keyframes twinkle{ 0%,100%{ opacity:.4; transform:scale(.8);} 50%{ opacity:1; transform:scale(1.2);} }
@keyframes shimmer{ 0%{ transform:translateX(-100%);} 60%,100%{ transform:translateX(200%);} }
@keyframes pop{ 0%{ transform:scale(.9);} 50%{ transform:scale(1.06);} 100%{ transform:scale(1);} }
@keyframes floatup{ 0%{ opacity:1; transform:translate(-50%,-50%);} 100%{ opacity:0; transform:translate(calc(-50% + var(--tx)),-260%);} }
@keyframes fall{ 0%{ opacity:1; top:-20px;} 100%{ opacity:.9; top:105%;} }
.td-breathe{ animation:breathe 3.4s ease-in-out infinite; }
@keyframes breathe{ 0%,100%{ transform:scale(1);} 50%{ transform:scale(1.04);} }
@media (prefers-reduced-motion: reduce){ .td-breathe,.td-shimmer,.td-spark,.td-burst b,.td-confetti b{ animation:none!important; } .td-bar,.td-chargefill,.td-progfill,.td-wrap{ transition:none; } }
`;
