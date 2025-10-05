// 背景アニメーション：ランダムな円がゆっくり出現して消える演出
// - 画面全体に固定配置されたキャンバスに描画します
// - 円の位置・色・大きさ・寿命をランダム生成します
// - フェードイン → 一定時間保持 → フェードアウト のアルファ変化で柔らかく表現します

(function () {
  // キャンバス要素と 2D コンテキストを取得
  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById('bg-canvas');
  /** @type {CanvasRenderingContext2D} */
  const ctx = canvas.getContext('2d');

  // 高解像度ディスプレイ対応のスケール
  let devicePixelRatioScale = 1;

  // ウィンドウサイズに合わせてキャンバス解像度を更新する
  function resizeCanvas() {
    const { innerWidth, innerHeight, devicePixelRatio } = window;
    // スケールが大きすぎると描画コストが上がるため上限を 2 に制限
    devicePixelRatioScale = Math.min(2, devicePixelRatio || 1);

    // 実ピクセルでのキャンバスサイズ（レンダリング解像度）を設定
    canvas.width = Math.floor(innerWidth * devicePixelRatioScale);
    canvas.height = Math.floor(innerHeight * devicePixelRatioScale);

    // CSS ピクセルでの見かけサイズ
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';

    // 座標系をスケール分だけ拡大（以降の描画は CSS ピクセル基準で扱える）
    ctx.setTransform(devicePixelRatioScale, 0, 0, devicePixelRatioScale, 0, 0);
  }

  // 画面に存在する円のリスト
  /** @type {Array<{x:number,y:number,radius:number,color:string,lifeMs:number,fadeInPortion:number,fadeOutPortion:number,createdAt:number}>} */
  const circles = [];

  // min 以上 max 未満のランダムな数値を返すユーティリティ
  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  // 新しい円を 1 つ生成して配列に追加
  function spawnCircle() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // 画面サイズに比例した半径範囲（最小/最大）を決定
    const maxRadius = Math.max(w, h) * 0.08; // 最大で画面の約 8%
    const minRadius = Math.max(20, Math.min(w, h) * 0.01); // 画面が小さい場合でも 20px は確保
    const radius = random(minRadius, maxRadius);

    // 画面外も含めて配置して、フェードで自然に出入りする印象に
    const x = random(-radius, w + radius);
    const y = random(-radius, h + radius);

    // パステルカラー（低めの彩度・高めの輝度）
    const hue = Math.floor(random(0, 360));
    const sat = Math.floor(random(30, 45));  // 彩度ひかえめ
    const light = Math.floor(random(80, 92)); // 輝度高め
    const color = `hsla(${hue} ${sat}% ${light}% / 1)`;

    // 円の寿命（ミリ秒）。短すぎると点滅のように見えるため最短を長めに
    const lifeMs = random(9000, 14000); // 9〜14 秒

    // フェードイン・フェードアウトの比率。残りは保持時間
    const fadeInPortion = 0.25;  // 最初の 25% はフェードイン
    const fadeOutPortion = 0.25; // 最後の 25% はフェードアウト

    const createdAt = performance.now();
    circles.push({ x, y, radius, color, lifeMs, fadeInPortion, fadeOutPortion, createdAt });
  }

  // 前回スポーンした時刻（ミリ秒）
  let lastSpawn = 0;
  // スムージング用：前フレーム時刻（NaN 回避のため初期化）
  let lastNow = 0;

  // 毎フレーム呼ばれるアニメーションループ
  function animate(now) {
    requestAnimationFrame(animate);

    const w = canvas.width / devicePixelRatioScale;  // CSS ピクセル換算の幅
    const h = canvas.height / devicePixelRatioScale; // CSS ピクセル換算の高さ

    // 画面全体をクリア
    ctx.clearRect(0, 0, w, h);

    // 経過時間（ms）をクランプして、フレームスキップ時の急激な変化を抑制
    const delta = Math.min(Math.max(now - lastNow, 0), 50); // 最大 50ms（~20fps 相当）
    lastNow = now;

    // 円の生成ペース：およそ 0.4 秒ごとに新しい円を作成
    if (now - lastSpawn > 400) {
      lastSpawn = now;
      // たまに 2〜3 個まとめて出すことで、出現が単調にならないように
      const count = Math.random() < 0.2 ? Math.floor(random(2, 4)) : 1;
      for (let i = 0; i < count; i++) spawnCircle();
    }

    // 円を描画し、寿命が尽きたものは配列から取り除く
    for (let i = circles.length - 1; i >= 0; i--) {
      const c = circles[i];
      // 経過時間：delta を用いて負の値や極端なジャンプを避ける
      // createdAt を毎フレーム delta で進めることで、時計のズレに頑健に
      c.createdAt += delta; // インプレースで進める（比較的安価）
      const age = now - c.createdAt;
      if (age >= c.lifeMs) { circles.splice(i, 1); continue; }

      // 進行度（0 → 1）
      const t = age / c.lifeMs;

      // 透明度（アルファ）をフェードイン/アウトの比率に応じて計算
      let alpha;
      if (t < c.fadeInPortion) {
        // フェードイン：0 から 1 へ直線的に増加
        alpha = t / c.fadeInPortion;
      } else if (t > 1 - c.fadeOutPortion) {
        // フェードアウト：1 から 0 へ直線的に減少
        alpha = (1 - t) / c.fadeOutPortion;
      } else {
        // 保持時間中は 1 を維持
        alpha = 1;
      }

      // 数値の安全範囲にクランプ（NaN/Inf/負値を避ける）
      if (!Number.isFinite(alpha)) alpha = 0;
      alpha = Math.max(0, Math.min(alpha, 1));

      // 全体として柔らかい印象にするため、最終アルファを弱める
      alpha *= 0.22;

    // 放射状グラデーション（エッジを強調：中心は透明、周辺で色が立ち上がり外側は再び透明）
    // これにより、円のエッジだけがふわっと見える
    ctx.globalAlpha = alpha;
    const gradient = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.radius);
    gradient.addColorStop(0.0, 'transparent');
    gradient.addColorStop(0.6, 'transparent');
    gradient.addColorStop(0.85, c.color);     // エッジ付近を最も色づけ
    gradient.addColorStop(1.0, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
    ctx.fill();
    }

    // 念のためアルファを元に戻す
    ctx.globalAlpha = 1;
  }

  // 初期化：サイズを合わせてからアニメーションを開始
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  requestAnimationFrame(animate);
})();


