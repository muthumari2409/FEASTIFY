// FEASTIFY dummy payment popup
// Use: openPayment(amount, bookingId)

function openPayment(amount, bookingId) {
  let box = document.getElementById("fstPay");
  if (!box) {
    box = document.createElement("div");
    box.id = "fstPay";
    box.innerHTML = `
      <style>
        #fstPay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:9999;font-family:sans-serif}
        #fstPay .card-box{background:#fff;width:90%;max-width:380px;border-radius:14px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.3)}
        #fstPay h3{margin:0 0 10px}
        #fstPay input,#fstPay select{width:100%;padding:10px;margin:8px 0;border:1px solid #ccc;border-radius:8px;box-sizing:border-box}
        #fstPay .pay-btn{width:100%;padding:12px;border:0;border-radius:8px;background:#28a745;color:#fff;font-size:16px;cursor:pointer;margin-top:8px}
        #fstPay .cancel-btn{width:100%;padding:10px;border:0;background:none;color:#666;cursor:pointer;margin-top:4px}
        #fstPay .center{text-align:center;padding:20px 0}
        #fstPay .spinner{width:50px;height:50px;border:5px solid #ddd;border-top-color:#28a745;border-radius:50%;margin:0 auto;animation:fstSpin 1s linear infinite}
        @keyframes fstSpin{to{transform:rotate(360deg)}}
      </style>
      <div class="card-box">
        <div id="fstStepForm">
          <h3>💳 FEASTIFY Payment</h3>
          <p>Amount: <b>₹<span id="fstAmount"></span></b></p>
          <select id="fstMethod" onchange="fstChangeMethod()">
            <option value="UPI">UPI</option>
            <option value="Card">Debit / Credit Card</option>
          </select>
          <input id="fstUpi" placeholder="UPI ID (eg: name@okaxis)">
          <input id="fstCard" placeholder="16 digit card number" maxlength="16" style="display:none">
          <button class="pay-btn" onclick="fstDoPay()">Pay Now</button>
          <button class="cancel-btn" onclick="fstClose()">Cancel</button>
        </div>
        <div id="fstStepLoading" class="center" style="display:none">
          <div class="spinner"></div>
          <p>Processing payment...</p>
        </div>
        <div id="fstStepDone" class="center" style="display:none">
          <div style="font-size:60px">✅</div>
          <h3 style="color:#28a745">Payment Successful!</h3>
          <p>Transaction ID: <b id="fstTxn"></b></p>
          <button class="pay-btn" onclick="location.reload()">Done</button>
        </div>
      </div>`;
    document.body.appendChild(box);
  }
  box.dataset.amount = amount;
  box.dataset.booking = bookingId || "";
  document.getElementById("fstAmount").innerText = amount;
  fstShow("fstStepForm");
  box.style.display = "flex";
}

function fstShow(id) {
  ["fstStepForm", "fstStepLoading", "fstStepDone"].forEach(s =>
    document.getElementById(s).style.display = (s === id ? "block" : "none"));
}

function fstClose() {
  document.getElementById("fstPay").style.display = "none";
}

function fstChangeMethod() {
  const m = document.getElementById("fstMethod").value;
  document.getElementById("fstUpi").style.display = m === "UPI" ? "block" : "none";
  document.getElementById("fstCard").style.display = m === "Card" ? "block" : "none";
}

async function fstDoPay() {
  const box = document.getElementById("fstPay");
  const method = document.getElementById("fstMethod").value;

  if (method === "UPI" && !document.getElementById("fstUpi").value.includes("@")) {
    alert("Please enter a valid UPI ID"); return;
  }
  if (method === "Card" && !/^\d{16}$/.test(document.getElementById("fstCard").value)) {
    alert("Please enter a 16 digit card number"); return;
  }

  fstShow("fstStepLoading");
  await new Promise(r => setTimeout(r, 2000));

  try {
    const res = await fetch("/api/payments/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(box.dataset.amount),
        booking_id: box.dataset.booking,
        method: method
      })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("fstTxn").innerText = data.transaction_id;
      fstShow("fstStepDone");
    } else {
      alert(data.message || "Payment failed");
      fstShow("fstStepForm");
    }
  } catch (e) {
    alert("Server error, try again");
    fstShow("fstStepForm");
  }
}